# Troubleshooting & FAQ

This page addresses common questions, debugging techniques, and edge cases you might encounter when using TypePHP in local development, test suites, or production environments.

---

## Configuration & Execution

### Why is my file or method not being type-checked?

If TypePHP is not enforcing contracts on a specific file or method, check the following common causes:

1. **Path Exclusion Specificity:** Check your `typephp.php` configuration. If your file matches an `exclude` pattern (such as `vendor/**` or `storage/**`), TypePHP skips AST transformation. Remember that equal length patterns favor `exclude`.
2. **Ignore Annotations:** Check if the file header contains `@typephp-ignore-file` or if the method docblock contains `@typephp-ignore`.
3. **Disabled Inline Variable Toggles:** If an inline variable (`/** @var positive-int $x */`) is not throwing an error, verify that the corresponding toggle inside `inline_vars` in `typephp.php` is set to `true`.
4. **Stale Cache:** If you recently edited docblocks or configuration settings, your pre-transformed file might be cached on disk. Run `vendor/bin/typephp cache:clear`.

---

### How do I know if TypePHP is actively transforming a file?

You can verify that a file is being intercepted and transformed in two ways:

1. **Intentionally Trigger an Error:** Pass an invalid argument (such as a negative integer to a `positive-int` parameter). If a `TypePHP\Exception\TypeError` is thrown, TypePHP is active.
2. **Inspect the Cache Directory:** Look inside your configured `cache_dir` (if undefined, this defaults to your system temporary directory: `sys_get_temp_dir() . '/typephp-cache/'`). You will see transformed PHP files containing injected `RuntimeTypeChecker` calls.

---

### Why are files inside my custom `cache_dir` not being intercepted?

If you configured a custom `cache_dir` inside your project directory (e.g., `__DIR__ . '/storage/typephp'`) and set your include paths to `['**']`, you might wonder why the cache files aren't being transformed.

**This is a built-in safety mechanism.** TypePHP automatically detects your `cache_dir` and unconditionally excludes it from its internal `StreamWrapper` and `FileFilter`. This prevents catastrophic infinite loops and double-parsing overhead that would occur if TypePHP tried to intercept and transform its own cached files.

---

### How do I clear the AST cache?

You can wipe the cache using the CLI runner:

```bash
vendor/bin/typephp cache:clear
```

If you are changing configuration settings frequently during local development, you can temporarily disable disk caching in `typephp.php`:

```php
'cache' => false, // Transforms files purely in RAM (php://memory)
```

---

## Performance & Optimization

### How do I optimize performance for massive array datasets (10,000+ items)?

If your application processes large collections (e.g., database result sets, search index batches, or CSV exports with 5,000 to 100,000+ items), configure `'array_validation' => 'hybrid'` in `typephp.php`:

```php
// typephp.php
return [
    'array_validation' => 'hybrid',
];
```

* **Default (`'full'`):** Runs an exhaustive O(n) check on every element.
* **Hybrid (`'hybrid'`):** Activates Beartype-style O(1) sampling for arrays exceeding 128 items (verifying structure in C via `array_is_list()`, boundary elements, and random internal samples), reducing validation latency on 100,000 items from **81 seconds down to 0.83 seconds (97x faster)**.

---

### Should I run JIT with TypePHP?

* **Short-Lived CLI Test Runs (Pest / PHPUnit):** Run tests with standard PHP CLI execution (without JIT). Because a test suite finishes in seconds, allocating JIT buffers and compiling tracing buffers on a short-lived process adds compilation overhead.
* **Production Web Servers & Long-Running Workers (PHP-FPM, FrankenPHP, Octane, Swoole):** Enable tracing JIT with `opcache.jit=1254` and `opcache.jit_buffer_size=128M`. In long-running processes, tracing JIT compiles the hot type-checking loops into native CPU assembly, providing a **1.5x to 4.8x throughput increase** (over 190,000 ops/sec on shapes).

---

## Type Enforcement & Edge Cases

### Why did TypePHP catch an unexpected key in an array shape?

By default, array shapes (`array{id: int, name: string}`) are **sealed**. If an external database query or framework metadata passes extra fields that are not declared in the shape, TypePHP rejects them with `contains unsealed unexpected key`.

**Solution:** If extra dynamic fields are expected, declare an **unsealed shape** using `...<K, V>` or `...`:
```php
/**
 * @param array{id: int, name: string, ...<string, mixed>} $payload
 */
```

---

### Why didn't TypePHP catch a bad property assignment from an external file?

TypePHP injects guard rails at the call site where assignments happen.

* **Whitelisted Caller File:** If `Controller.php` (whitelisted) sets `$user->id = -5`, TypePHP intercepts the assignment and throws a `TypeError`.
* **Excluded Caller File:** If `LegacyVendor.php` (excluded) sets `$user->id = -5`, TypePHP does not modify `LegacyVendor.php`, so the assignment runs natively.

**Solution:** In PHP 8.4, use **Property Hooks** (`set => $this->_id = $value`). Property hooks run *inside* the class itself, guaranteeing that assignments are validated regardless of where the call originated.

---

### Why is my `@method` annotation with quoted literals like `'active'|'pending'` not being enforced?

`phpdoc-parser`'s grammar engine for `@method` parameter lists can encounter ambiguity when parsing unparenthesized single or double quotes directly inside parameter type signatures (such as `@method bool updateStatus('active'|'pending' $status)`). When `phpdoc-parser` encounters this grammar ambiguity, it drops that specific `@method` tag during DocBlock parsing.

**Solution:** Use a local `@phpstan-type` alias to define the union string literal or shape, and reference the alias in your `@method` annotation:

```php
/**
 * Best Practice: Clean & Grammar-Safe via @phpstan-type
 *
 * @phpstan-type StatusUnion 'active'|'pending'
 *
 * @method bool updateStatus(StatusUnion $status)
 */
class OrderService
{
    public function __call(string $name, array $arguments) { ... }
}
```

---

### Why does a generic container allow any item if no annotation is provided?

If you instantiate a generic class without an inline `@var` annotation:

```php
$collection = new Collection(); // Unannotated generic instance
```

TypePHP uses **First-Use Type Inference**. It allows the first method call (such as `$collection->add(new User())`) to establish the template type `T = User`. Once established, all subsequent calls on that instance enforce `T = User`. 

If you want strict enforcement before any items are added, prebind the instance using an inline `@var` annotation:

```php
/** @var Collection<User> $collection */
$collection = new Collection();
```

---

## Frameworks & Tooling

### Does TypePHP work with Laravel, Symfony, or WordPress?

Yes. TypePHP boots automatically as soon as Composer's autoloader (`vendor/autoload.php`) is required. 

It works seamlessly with standard framework entry points like `public/index.php`, Laravel's `artisan`, or Symfony's `bin/console`. No special framework bundles or service providers are required.

---

### How do I temporarily disable TypePHP in an emergency or during CI tooling runs?

You have three options for disabling TypePHP:

1. **Environment Level (Full Prevention):** Set `TYPEPHP_DISABLE=true` in your `.env`, CI workflow step, or server environment. This prevents TypePHP from registering its stream wrapper during Composer autoloading.
2. **Config Level (Pass-Through Mode):** Set `'enabled' => false` in `typephp.php` or call `TypePHP::setConfig(['enabled' => false])`. TypePHP will boot, but all checks turn into instant no-ops.
3. **PHP Constant:** Define `define('TYPEPHP_DISABLE', true);` before `vendor/autoload.php` is required.

---

### Can I run TypePHP alongside static analysis tools?

Yes, it is highly recommended. 

* **Static Analyzers (PHPStan, Psalm, Mago):** Analyze your source code at compile-time, linting docblock syntax and checking static logic in your IDE.
* **TypePHP:** Enforces those same PHPDoc contracts at runtime during dynamic execution, protecting your application against invalid database records, un-sanitized API payloads, and unexpected runtime state.
```