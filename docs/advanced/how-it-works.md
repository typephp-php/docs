# How It Works

TypePHP provides configurable runtime type enforcement without requiring custom C-extensions or modified PHP binaries. It operates entirely in PHP user-land by leveraging PHP's native `StreamWrapper` subsystem, Abstract Syntax Tree (AST) transformations, and in-memory state tracking.

---

## Parser Engine Dependencies

TypePHP relies on two industry-standard parsing libraries to process source code and docblock contracts:

* **`nikic/php-parser`:** Parses raw PHP source code into Abstract Syntax Tree (AST) statement nodes, allowing TypePHP to inspect assignments, function signatures, and property hooks to inject guard-rail expressions.
* **`phpstan/phpdoc-parser`:** Tokenizes and parses PHPDoc annotations (`@param`, `@return`, `@template`, `@var`, `@phpstan-type`) into strongly typed AST `TypeNode` objects.

---

## The 5-Step Execution Lifecycle

```
[require "file.php"] 
         │
         ▼
 1. Stream Interception (StreamWrapper)
         │
         ▼
 2. Path & Specificity Filtering (FileFilter)
         │
         ▼
 3. AST Transformation & Injection (ContractVisitor)
         │
         ▼
 4. Zero Line-Drift Formatting & Caching (TypePHPPrinter)
         │
         ▼
 5. Runtime Type Enforcement (RuntimeTypeChecker)
```

---

## Project Root Resolution & Web Server Independence

To ensure consistent configuration loading across CLI commands, test runners (Pest, PHPUnit), and production web servers (where `getcwd()` points to `public/`), `Config::getProjectRoot()` searches upwards from the library's directory to locate `vendor/autoload.php` or `composer.json`.

Once located, the project root path is memoized in static memory. All relative `include`, `exclude`, and `cache_dir` configuration globs resolve reliably against the true application root directory across all PHP SAPIs (`cli`, `fpm`, `frankenphp`, `swoole`).

---

## Stream Interception

TypePHP registers a custom stream wrapper for PHP's native `file://` protocol using `stream_wrapper_register()`.

When PHP attempts to include a file, TypePHP's `StreamWrapper` intercepts the `open` call. If the call is a read-only inspection (such as `file_get_contents()` or `token_get_all()`), TypePHP passes the raw file through untouched. If the call is an execution request (`require` or `include`), the file proceeds to path filtering.

Because stream handlers hook directly into PHP's stream subsystem, all underlying stream read, write, and stat operations execute **natively at C-level speed inside Zend Engine**, ensuring zero user-land file I/O bottlenecks.

---

## Path Filtering and Pattern Specificity

TypePHP alone determines which files to transform and enforce docblock contracts on based on your `typephp.php` configuration:

```php
'include' => ['src/**', 'vendor/my-org/my-package/**'],
'exclude' => ['vendor/**', 'storage/**'],
```

TypePHP calculates pattern specificity based on glob length. If you whitelist a specific vendor package (`'vendor/my-org/my-package/**'`), its pattern length (27) takes precedence over the general `'vendor/**'` exclusion (8).

### Excluded Files and Whitelisted Boundaries

When a file is excluded (blacklisted):

1. **Zero AST Modification:** The excluded file remains 100% raw, untouched PHP code. No AST parsing or check injection occurs on the excluded file.
2. **Active Whitelisted Guard Rails:** If an excluded file calls a method inside an included/whitelisted file passing invalid data, **a `TypeError` is still thrown**. The type guard runs inside the whitelisted method, protecting the whitelisted code regardless of who called it.
3. **Caller Line Attribution:** Even though the blacklisted caller file was never modified, `ErrorFactory` inspects the call stack trace and attributes the `TypeError` file and line number directly to the exact call site inside the blacklisted file!

---

## AST Transformation and Injection

If a file is included, TypePHP parses the source code into an AST using `nikic/php-parser` and `phpstan/phpdoc-parser`.

`ContractVisitor` traverses the AST and injects optimized single-line guard rails:

* **Compile-Time Parameter Arrays:** Injects `RuntimeTypeChecker::setupScope(__METHOD__, ['id' => $id, 'name' => $name], $this)` using direct opcode parameter arrays rather than calling `get_defined_vars()`.
* **Selective Wrapper Injection:** Injects `wrapCallable` and `wrapIterable` only on parameters typed as callables, closures, or iterators, eliminating wrapper overhead on standard scalars and objects.
* **Function Return:** Wraps `return` statements with `RuntimeTypeChecker::checkReturn()`.
* **Local Assignments (`@var`):** Wraps `$x = $value` with `RuntimeTypeChecker::checkVariable()`.
* **Class Properties:** Wraps `$this->prop = $value` and PHP 8.4 Property Hooks with `RuntimeTypeChecker::checkProperty()`.

---

## Tooling Annotation Normalization & Tag Priority Hierarchy

Third-party packages often define both broad IDE docblocks and strict tool-specific contracts on the same signature (such as `@param mixed $element` alongside `@phpstan-param T $element` in Doctrine Collections).

`DocblockExtractor` normalizes and evaluates tag definitions using a **3-Tier Priority System**:

1. **Tool-Specific Annotations Take Precedence:** `@phpstan-param` and `@psalm-param` override `@param`; `@phpstan-return` and `@psalm-return` override `@return`; `@phpstan-var` overrides `@var`.
2. **Inherited Template Extraction:** Collects class, interface, and trait template mappings across all recognized variations (`@extends`, `@template-extends`, `@phpstan-extends`, `@psalm-extends`, `@implements`, `@template-implements`, `@use`, `@template-use`).
3. **Variance Modifiers:** Extracts class-level `@template-covariant` and `@template-contravariant` tags to configure the runtime variance engine.

---

## Zero Line-Drift Formatting and Caching

A common issue with AST code injection is that adding new statements pushes subsequent code down, causing line numbers in error stack traces to drift out of sync.

TypePHP solves this using `TypePHPPrinter` and regex post-processing. Injected guard rails are squashed onto single lines and appended directly to existing code blocks (such as the opening `{` of a function signature). 

**Line numbers in your source files remain 100% identical before and after transformation.**

### Disk Caching

Once transformed, TypePHP saves the resulting code to disk in your configured `cache_dir` (which defaults to `sys_get_temp_dir() . '/typephp-cache/'`). On all subsequent requests:
* AST parsing runs **0 times**.
* PHP's **OPCache** compiles the cached file once into bytecode in RAM.
* Stream file reads execute natively at C-level speed inside Zend Engine.

---

## Collection Validation Mechanics

TypePHP handles collection structures through specialized validators in `TypeValidatorRegistry`:

### Array Validation Strategies (`full` vs `hybrid`)
* **Strict Full Mode (`'full'`):** Iterates every element with zero throwaway string allocations on the happy path.
* **Beartype Hybrid Mode (`'hybrid'`):** For collections exceeding 64 items, validates container structure (`array_is_list`), boundary elements (first/last), and 3 random internal samples in $O(1)$ constant time.

### Array Shapes (`ArrayShapeValidator`)
* **Required vs. Optional Keys:** Verifies that required keys are present while allowing optional keys to be omitted.
* **Sealed vs. Unsealed Shapes:** Sealed shapes use an $O(1)$ key count comparison (`$valueCount === $matchedKeysCount`) to verify that no extra keys exist without allocating `array_diff_key()` arrays. Unsealed shapes (`array{id: int, ...<string, string>}`) validate extra key-value pairs against the unsealed type specification.

### Reflection-Free `stdClass` Shapes (`ObjectShapeValidator`)
Validates dynamic object shapes directly via native property existence checks (`property_exists()`, `isset()`), bypassing `\ReflectionObject` allocations.

---

## Lazy Proxies: Callables, Generators, and Iterators

TypePHP uses lazy wrappers to validate dynamic data structures upon invocation or iteration without forcing eager evaluation:

### Callable Wrapper (`CallableWrapper`)
When a function accepts a `callable(int): string` parameter, `RuntimeTypeChecker::wrapCallable()` wraps the callback in an interceptor closure:
* **Invocation Validation:** When the callback is called, its incoming arguments are validated against the declared parameter types.
* **Return Validation:** When the callback returns, its return value is validated against the declared return type.
* **Static Closure Constraints:** Enforces `static-closure` rules, rejecting closures bound to `$this`.

### Iterator Proxy (`IterableWrapper` & `IteratorProxy`)
When an iterable or generator is passed into a function accepting `Traversable<string, positive-int>`:
* **Lazy Item Validation:** Values and keys are validated on-the-fly during iteration inside `current()` or `yield`.
* **Rewindability:** `IteratorProxy` unwraps and preserves iterator rewindability, allowing you to iterate over the wrapped Traversable in multiple `foreach` loops cleanly.
* **Method & Countable Forwarding:** Forwards `Countable::count()` and custom method calls directly to the inner iterator using `__call()`.
* **Generator `TSend` Input Validation:** `checkSend()` intercepts values passed via `$gen->send()` and validates them against the declared `TSend` template parameter.

---

## Inheritance Tracking and In-Memory Reflection Caching

TypePHP resolves method and property contracts across complex Object-Oriented hierarchies (abstract classes, parent classes, interfaces, PHP 8.4 interface properties, and traits) using `HierarchyResolver`.

### Gap-Filling and Parameter Renaming
* **Gap-Filling:** If a child method defines a docblock for `$name` but leaves `$id` un-annotated, `ContractParser` traverses up the hierarchy to fill in the missing contract for `$id` from parent classes or interfaces.
* **Parameter Renaming:** Inherited parameters are mapped by **index position** rather than parameter name. If a child class renames `$id` to `$userId`, the contract declared on `$id` at index 0 is mapped and enforced on `$userId`.
* **Vendor Isolation:** Inherited docblocks from files matching `exclude` rules (such as `/vendor/`) are ignored to prevent third-party docblock bugs from affecting your application.

### O(1) Contract Short-Circuiting
`ContractParser` computes `hasParamContract` and `hasReturnContract` boolean flags during initial reflection resolution. Methods without DocBlock contracts anywhere in their inheritance hierarchy exit in a single opcode without evaluating aliases or template lookups.

---

## Lexical Scope Tracking (`ScopeManager`)

TypePHP tracks local `@var` annotations using `ScopeManager` during AST traversal.

* **Scope Stack Frames:** Entering a function, closure, or control block (`if`, `elseif`, `else`, `foreach`, `while`, `for`, `try/catch`) pushes a new scope frame (`pushScope()`) that inherits outer variable contracts.
* **Variable Shadowing:** Re-declaring a variable type inside an `if` block (e.g. `/** @var non-empty-string $z */`) applies strictly inside that block.
* **Scope Restoration:** Exiting the block (`popScope()`) restores outer variables back to their original type contracts. Unexecuted branches (such as `if (false)`) never pollute the outer scope.

---

## State Tracking Mechanics

### Object Instance Generics (`WeakMap`)
When you instantiate a generic object (such as `Collection<User>`), `TemplateManager` binds template parameters (`T = User`) to that specific object instance using PHP's native `WeakMap`.

Because `WeakMap` uses weak references, when the object instance is garbage-collected by PHP, its generic state is automatically deleted from memory with **zero memory leaks**.

### Call Stack Scope Tracking (`ScopeCleaner`)
For function-level templates (`@template T`), TypePHP pushes a temporary call frame when entering the function and returns a `ScopeCleaner` object. When the function exits or throws an exception, `ScopeCleaner::__destruct()` automatically pops the call frame, keeping generic state clean across recursive calls.
```