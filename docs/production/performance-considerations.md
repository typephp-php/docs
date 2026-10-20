# Performance Considerations

TypePHP is engineered for sub-second CLI test execution, zero memory leaks, and high-throughput production workloads. This document details the internal performance architecture, compile-time AST check elimination, collection validation strategies, JIT compiler optimizations, and benchmarking guidelines.

---

## Performance Architecture Overview

TypePHP minimizes execution overhead through 7 core architectural optimizations:

```
[Source Code / Included File]
         │
         ├── 1. Compile-Time AST Check Elimination ──► 0 opcodes for proven literals, $this, & defaults
         │
         ├── 2. Direct Opcode Parameter Arrays ──► ['id' => $id] (Zero symbol table scans)
         │
         ├── 3. O(1) Contract Short-Circuiting ──► Instant 1-op exit if method has no contracts
         │
         ├── 4. Selective Proxy Injection ──► Zero wrapper overhead for non-callable types
         │
         ├── 5. Vendor Boundary Short-Circuiting ──► Bypasses vendor-internal calls
         │
         ├── 6. Zero-Allocation Lazy Context ──► Strings constructed only on validation failure
         │
         └── 7. WeakMap Object Memoization ──► O(1) cached check on repeated object instances
```

---

## 1. Flagship: Compile-Time AST Check Elimination

The most powerful performance optimization in TypePHP is **omitting runtime checks entirely** when code is mathematically or logically proven to be correct during AST transformation (`eliminate_statically_proven_checks => true`).

### The Zend VM Opcode Difference: Before vs. After

Consider a standard getter returning a string literal:
```php
/** @return non-empty-string */
public function getVersion(): string
{
    return '1.0.0';
}
```

#### Without Elimination (Runtime Checking):
```php
return ($__typephpRet = \TypePHP\Internal\RuntimeTypeChecker::checkReturn(__METHOD__, '1.0.0', $this)) instanceof \TypePHP\Internal\Diagnostic\ErrorMessage 
    ? throw ... 
    : $__typephpRet;
```
* Pushes arguments to the VM stack $\to$ calls `RuntimeTypeChecker::checkReturn()`.
* Resolves method name $\to$ looks up contract cache $\to$ executes string length check.
* Assigns to local variable $\to$ executes `T_INSTANCEOF` $\to$ evaluates ternary branch.
* **Cost:** ~50 Zend VM opcodes, 1 stack frame, and temporary memory allocations on **every single call**.

#### With Compile-Time Elimination:
Because `'1.0.0'` is proven valid during file transformation, TypePHP leaves the statement raw:
```php
return '1.0.0';
```
* **Cost:** **1 single Zend VM opcode (`ZEND_RETURN`)**.
* **Performance Gain:** **~98% reduction in execution time** (15M–30M calls/sec native throughput).

### Statically Eliminated Scenarios
* **Literal Returns:** `return 42;` vs `@return positive-int`, `return 'active';` vs `'active'|'pending'`.
* **Fluent Method Chaining:** `return $this;` against `@return $this` / `@return self` (identity truth $\to$ zero checks, allowing fluent builders to run at 100% native speed).
* **Late Static Binding:** `return new static();` against `@return static`.
* **Exact Object Instantiations:** `return new User('Alice');` against `@return User` (FQCN matches without reflection).
* **Empty Arrays:** `return [];` against `list<T>`, `array<K, V>`, `iterable`.
* **Sequential Lists:** `return [1, 2, 3];` against `list<positive-int>` (bypasses loop entirely).
* **Property Defaults:** `public int $retries = 3;` vs `@var positive-int` (bypasses constructor synthesis).

---

## 2. Core In-Memory Optimizations

### Compile-Time Parameter Array Generation
Instead of calling `get_defined_vars()` on function entry (which forces PHP's C-engine to traverse the local symbol table and allocate an array copy), TypePHP's AST injector generates an explicit compile-time parameter array:
```php
// Injected code:
\TypePHP\Internal\RuntimeTypeChecker::setupScope(__METHOD__, ['id' => $id, 'name' => $name], $this);
```
PHP compiles this directly into an `OP_INIT_ARRAY` opcode fetch, accelerating function entry by 3x–5x.

### O(1) Contract Short-Circuiting
`DocblockParser` pre-calculates `hasParamContract` and `hasReturnContract` boolean flags during initial reflection resolution. Methods without DocBlock contracts anywhere in their inheritance hierarchy exit in a single opcode without evaluating aliases or template lookups:
```php
if (! $contract['hasParamContract']) {
    return null; // Instant 1-op exit
}
```

### Selective Proxy Wrapper Injection
Proxy wrapper functions (`wrapCallable` and `wrapIterable`) are injected only when a parameter is typed as `callable`, `Closure`, `iterable`, `Traversable`, `Generator`, or when DocBlocks explicitly declare callable/stream types. Scalar types (`int`, `string`, `bool`, `float`, `array`, `object`, standard classes) bypass wrapper calls entirely.

### Vendor Boundary Short-Circuiting (`vendor_boundary_only`)
When whitelisting a third-party vendor package (e.g. `Illuminate\Support\Collection`), calls originating from within the vendor package itself bypass strict type validation. TypePHP only enforces contracts when calls cross the boundary from application code into vendor code.

### Zero-Allocation Lazy Context Formatting
In collection validation loops (`ArrayValidator`, `GenericValidator`), context strings (e.g. `['items'][2]`) are **not** concatenated during successful iterations. The error path string is constructed only when a validation check fails, eliminating millions of throwaway string allocations on the happy path.

### Reflection-Free `stdClass` Validation
`ObjectShapeValidator` implements a dedicated fast path for `stdClass` instances. Because `stdClass` properties are dynamic, property existence is checked via native `property_exists()` / `isset()`, bypassing `\ReflectionObject` instantiation entirely.

### WeakMap Object Memoization (`\WeakMap`)
When validating collections or arrays of objects (such as `User[]` or `list<Producer<Dog>>`), `TypeValidatorRegistry` memoizes previously checked object instances against type signatures using PHP's native `WeakMap`:
* **O(1) Repeated Validation:** If an object instance has already been verified, subsequent checks on the same object return `null` (valid) instantly.
* **Zero Memory Leaks:** When an object instance is garbage-collected by PHP, its `WeakMap` cache entry is automatically purged from RAM.

---

## 3. Production Disk I/O Optimization (`cache_check_mtime => false`)

During local development, TypePHP inspects `@filemtime()` on every included file to automatically invalidate the cache when source code changes:

```php
// typephp.php (Production Setting)
return [
    'cache'             => true,
    'cache_check_mtime' => false, // Eliminates disk stat() calls in production
];
```

In production containers (Docker, Kubernetes, AWS Lambda), application source files are immutable. Setting `'cache_check_mtime' => false` **eliminates hundreds of disk `stat()` calls per web request**, allowing the Linux VFS cache and PHP OPCache to serve cached files with zero disk I/O.

> **Deployment Note:** When `'cache_check_mtime' => false` is configured, add `php bin/typephp cache:warm` to your CI/CD deployment pipeline after `composer install`.

---

## 4. Array Validation Strategies (`full` vs `hybrid`)

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

## 5. PHP 8 JIT Performance & Inlining Synergy

### How AST Check Elimination Unlocks JIT Inlining
PHP 8’s JIT (Just-In-Time) compiler operates by profiling execution paths and compiling hot bytecode loops directly into raw x86/ARM machine code.

* **With Call Wrappers:** When a getter is wrapped in `RuntimeTypeChecker::checkReturn()`, the JIT compiler refuses to inline the method because it involves dynamic method dispatch and potential exception branches.
* **With Check Elimination:** When TypePHP emits clean code (`return '1.0.0';` or `return $this;`), the JIT compiler can **inline the leaf method directly into the caller’s machine code**, reducing the call to zero CPU branch instructions.

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

### Recommended Production JIT Configuration

For Dockerfiles, php.ini, or production environments:

```ini
opcache.enable=1
opcache.enable_cli=1
opcache.jit=1254
opcache.jit_buffer_size=128M
```

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

### 3. Choose the Right Strategy for Your Workload
* **Local Testing & CI Suites:** Use `'array_validation' => 'full'` and standard PHP CLI execution (sub-second feedback without JIT warmup overhead).
* **Production Web Servers:** Use `'array_validation' => 'hybrid'`, `'cache_check_mtime' => false`, and `opcache.jit=1254` for maximum request throughput.