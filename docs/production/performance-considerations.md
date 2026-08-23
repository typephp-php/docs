# Performance Considerations

TypePHP is engineered for sub-second CLI test execution, zero memory leaks, and high-throughput production execution. This document details the internal performance architecture, collection validation strategies, JIT compiler optimizations, and benchmarking guidelines.

---

## Performance Architecture Overview

TypePHP minimizes execution overhead through 6 core architectural optimizations:

```
[Incoming Function Call / Data Check]
         │
         ├── 1. Direct Opcode Parameter Array ──► ['id' => $id] (Zero symbol table scans)
         │
         ├── 2. O(1) Contract Short-Circuit ──► Instant exit if method has no contracts
         │
         ├── 3. Selective Wrapper Injection ──► Zero proxy overhead for non-callable types
         │
         ├── 4. Zero-Allocation Lazy Context ──► Strings formatted only on validation failure
         │
         ├── 5. WeakMap Object Memoization ──► O(1) cached check on repeated object instances
         │
         └── 6. Reflection-Free stdClass Shapes ──► Direct property access without \ReflectionObject
```

---

## Core In-Memory Optimizations

### 1. Compile-Time Parameter Array Generation
Instead of calling `get_defined_vars()` on function entry (which forces PHP's C-engine to traverse the local symbol table and allocate an array copy), TypePHP's AST injector generates an explicit compile-time parameter array:
```php
// Injected code:
\TypePHP\Internal\RuntimeTypeChecker::setupScope(__METHOD__, ['id' => $id, 'name' => $name], $this);
```
PHP compiles this directly into an `OP_INIT_ARRAY` opcode fetch, accelerating function entry by 3x–5x.

### 2. O(1) Contract Short-Circuiting
`ContractParser` pre-calculates `hasParamContract` and `hasReturnContract` boolean flags during initial reflection resolution. Methods without DocBlock contracts anywhere in their inheritance hierarchy exit in a single opcode without evaluating aliases or template lookups:
```php
if (! $contract['hasParamContract']) {
    return null; // Instant 1-op exit
}
```

### 3. Selective Wrapper Injection
Proxy wrapper functions (`wrapCallable` and `wrapIterable`) are injected only when a parameter is typed as `callable`, `Closure`, `iterable`, `Traversable`, `Generator`, or when DocBlocks explicitly declare callable/stream types. Scalar types (`int`, `string`, `bool`, `float`, `array`, `object`, standard classes) bypass wrapper calls entirely.

### 4. Zero-Allocation Lazy Context Formatting
In collection validation loops (`ArrayValidator`, `GenericValidator`), context strings (e.g. `['items'][2]`) are **not** concatenated during successful iterations. The error path string is constructed only when a validation check fails, eliminating millions of throwaway string allocations on the happy path.

### 5. Reflection-Free `stdClass` Validation
`ObjectShapeValidator` implements a dedicated fast path for `stdClass` instances. Because `stdClass` properties are dynamic, property existence is checked via native `property_exists()` / `isset()`, bypassing `\ReflectionObject` instantiation entirely.

### 6. WeakMap Object Memoization (`\WeakMap`)
When validating collections or arrays of objects (such as `User[]` or `list<Producer<Dog>>`), `TypeValidatorRegistry` memoizes previously checked object instances against type signatures using PHP's native `WeakMap`:
* **O(1) Repeated Validation:** If an object instance has already been verified, subsequent checks on the same object return `null` (valid) instantly.
* **Zero Memory Leaks:** When an object instance is garbage-collected by PHP, its `WeakMap` cache entry is automatically purged from RAM.

---

## Array Validation Strategies (`full` vs `hybrid`)

Validating collection structures (`list<T>`, `array<K, V>`, `Type[]`) can be configured in `typephp.php` via `'array_validation'`:

```php
// typephp.php
return [
    'array_validation' => 'full', // 'full' or 'hybrid'
];
```

### 1. Strict Full Mode (`'array_validation' => 'full'`, Default)
* **Exhaustive O(n) Scan:** Validates every single element in the collection regardless of size.
* **100% Deterministic Precision:** Guarantees that any offending element anywhere in the collection will trigger an immediate `TypeError`.
* **Recommended for:** Unit test suites, CI/CD pipelines, and local development.

### 2. Beartype Hybrid Mode (`'array_validation' => 'hybrid'`)
* **Small Arrays ($N \le 128$ items):** Executes a 100% full scan.
* **Large Arrays ($N > 128$ items):** Executes $O(1)$ constant-time validation:
  1. Shallow check via native `array_is_list()` in C.
  2. Boundary checks on the first item (`$arr[0]`) and last item (`$arr[count - 1]`).
  3. Random walk sampling on 3 internal items.
* **Performance Gain:** Validating 100,000 items drops from **81 seconds down to 0.83 seconds (97x faster)**.
* **Recommended for:** High-throughput production servers and massive database result sets (5,000 to 100,000+ items).

---

## PHP 8 JIT Performance Benchmarks

Empirical benchmarking across standard execution and PHP 8 JIT modes (`tracing`, `function`, and `1254`) reveals clear performance characteristics:

### Long-Running Workloads & Batch Processing (JIT Recommended)

In long-running CLI scripts, batch jobs, and high-throughput production servers (PHP-FPM, FrankenPHP, Swoole, RoadRunner), **JIT provides a 1.5x to 4.8x performance increase**:

| Scenario (Full Mode) | Standard PHP (No JIT) | JIT (`tracing`, 128M) | JIT (`1254`, 128M) | JIT Speedup |
| :--- | :--- | :--- | :--- | :--- |
| **Small `list<int>`** (30 items, 10k calls) | 131 ms (75k ops/s) | 63 ms (158k ops/s) | **63 ms (158k ops/s)** | **2.0x Faster** |
| **Large `list<int>`** (1,000 items, 10k calls) | 2,723 ms (3.6k ops/s) | 860 ms (11.6k ops/s) | **833 ms (12.0k ops/s)** | **3.0x Faster** |
| **Massive `list<int>`** (100k items, 2k calls) | 88,557 ms (~88.5s) | 22,525 ms (~22.5s) | **17,131 ms (~17.1s)** | **4.8x Faster** |
| **Array Shapes** (3 keys, 10k calls) | 182 ms (54k ops/s) | 62 ms (160k ops/s) | **51 ms (193k ops/s)** | **3.5x Faster** |
| **Unsealed Shapes** (4 keys, 10k calls) | 168 ms (59k ops/s) | 90 ms (110k ops/s) | **50 ms (199k ops/s)** | **3.3x Faster** |
| **Generic Map `array<K, V>`** (50 items, 5k calls) | 295 ms (16k ops/s) | 148 ms (33k ops/s) | **71 ms (69k ops/s)** | **4.0x Faster** |

### Why `opcache.jit=1254` is the Optimal Setting

In PHP's JIT configuration syntax (`CRTO`):
* **`C = 1`**: Enables CPU-specific architecture optimizations (SSE / AVX native instructions).
* **`R = 2`**: Uses global register allocation (keeps hot variables in CPU hardware registers).
* **`T = 5`**: Uses **Tracing JIT** (profiles execution paths across function calls).
* **`O = 4`**: Enables aggressive loop unrolling and call inlining.

Tracing JIT traces the entire validation call stack from caller to validator, compiling the path into a single tight machine code loop. This enables **10 million full item validations in 833 milliseconds** and **~200,000 ops/sec on shapes**.

### Recommended Production JIT Configuration

For Dockerfiles, php.ini, or production servers:

```ini
opcache.enable=1
opcache.enable_cli=1
opcache.jit=1254
opcache.jit_buffer_size=128M
```

### Short-Lived CLI Test Runs (Pest / PHPUnit)

For single, short-lived test runs that finish in ~1 second, JIT initialization and trace compilation add a slight buffer overhead. For local test runs, standard PHP CLI execution without JIT is recommended for immediate sub-second feedback.

---

## Benchmarking Guidelines for Your Application

To measure TypePHP's performance in your own codebase:

### 1. Warm Up the Cache First
Always run `cache:warm` before benchmarking so AST transformation time is excluded from runtime measurements:
```bash
vendor/bin/typephp cache:warm
```

### 2. Compare Against a True Baseline
Set `TYPEPHP_DISABLE=true` in your environment to measure raw native PHP execution speed, then compare with TypePHP active.

### 3. Choose the Right Strategy for Your Data
* For standard API endpoints, DTOs, and test suites: use `'array_validation' => 'full'`.
* For multi-thousand element database exports and ingestion pipelines: use `'array_validation' => 'hybrid'`.
