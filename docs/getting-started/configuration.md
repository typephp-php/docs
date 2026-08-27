# Configuration

Generate a default `typephp.php` configuration file in your project root directory:

```bash
vendor/bin/typephp config:init
```

---

## Default Configuration Options

```php
<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Global Master Switch
    |--------------------------------------------------------------------------
    | Controls whether TypePHP enforces type checks at runtime.
    | Set to false for an emergency kill-switch or zero-overhead benchmarking.
    */
    'enabled' => true,

    /*
    |--------------------------------------------------------------------------
    | Function Boundary Contracts (@param & @return)
    |--------------------------------------------------------------------------
    | Enforces function and method parameter and return type contracts uniformly.
    */
    'params' => true,
    'returns' => true,

    /*
    |--------------------------------------------------------------------------
    | Respect Ignore Docblock Tags
    |--------------------------------------------------------------------------
    | Set to false in CI/CD runs to force type-checking on @typephp-ignore methods.
    */
    'respect_ignore_tags' => true,

    /*
    |--------------------------------------------------------------------------
    | Respect Native Parameter Nullability
    |--------------------------------------------------------------------------
    | When true (default), if a native PHP parameter explicitly declares
    | nullable syntax (e.g. ?array $param = null or int|null $id = null),
    | TypePHP permits null even if the DocBlock author omitted "|null"
    | (e.g. @param string[] $param).
    |
    | Set to false for strict pedantic enforcement where DocBlocks are the
    | absolute law and null is rejected unless explicitly typed in the DocBlock.
    */
    'respect_native_nullability' => true,

    /*
    |--------------------------------------------------------------------------
    | Magic Annotations (@property & @method)
    |--------------------------------------------------------------------------
    | Enforces class-level annotations for dynamic properties and magic methods
    | routed through __get, __set, __call, and __callStatic.
    */
    'magic_properties' => true,
    'magic_methods'    => true,

    /*
    |--------------------------------------------------------------------------
    | Array Validation Strategy
    |--------------------------------------------------------------------------
    | Controls how collections (list<T>, array<K, V>, Type[]) are verified:
    |
    | - 'full'   : (Default / Strict) 100% exhaustive O(n) scan on every item.
    |             Guarantees 100% single-item error detection on any array size.
    |
    | - 'hybrid' : (Beartype O(1) Mode) Fast boundary + random sampling on
    |             arrays > 64 items. Ideal for massive production datasets.
    */
    'array_validation' => 'full',

    /*
    |--------------------------------------------------------------------------
    | Enable Caching & Cache Directory
    |--------------------------------------------------------------------------
    | Pre-transforms and caches PHP files on disk for OPcache optimization.
    |
    | 'cache_dir' determines where these files are stored. By default (null), 
    | it uses your system's temp directory. You can change this to a path
    | inside your project (e.g., __DIR__ . '/storage/framework/typephp').
    | TypePHP automatically protects this directory from being double-transformed.
    */
    'cache' => true,
    'cache_dir' => null,

    /*
    |--------------------------------------------------------------------------
    | Registered Extensions
    |--------------------------------------------------------------------------
    | Explicitly list third-party extension classes that provide path overrides.
    */
    'extensions' => [
        // \Acme\Domain\TypePHPExtension::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Stub Files (DocBlock Overrides for Third-Party & Vendor Packages)
    |--------------------------------------------------------------------------
    | Path globs or specific file paths containing stub files (.stub, .stub.php, .php)
    | that override inaccurate or missing DocBlocks in third-party vendor packages.
    */
    'stubs' => [
        // 'stubs/**',
    ],

    /*
    |--------------------------------------------------------------------------
    | Inline Variable Validation (@var $x = ...)
    |--------------------------------------------------------------------------
    | Fine-grained control over local variable assignment checks.
    */
    'inline_vars' => [
        'properties' => true,
        'generics'   => true,
        'callables'  => true,
        'scalars'    => true,
        'arrays'     => true,
        'objects'    => true,
    ],

    /*
    |--------------------------------------------------------------------------
    | Included Paths & Whitelisting
    |--------------------------------------------------------------------------
    | Globs or specific file paths that should be intercepted and type-checked.
    | You can specify directory globs (e.g. 'src/**'), single vendor packages
    | (e.g. 'vendor/my-org/my-package/**'), or single specific files.
    */
    'include' => [
        'src/**',
        'app/**',
        'internals/**',
        'tests/**',
        // 'vendor/my-org/my-package/**', // Whitelist a specific vendor package
    ],

    /*
    |--------------------------------------------------------------------------
    | Excluded Paths
    |--------------------------------------------------------------------------
    | Globs or specific file paths that should be ignored by the type checker.
    */
    'exclude' => [
        'vendor/**',
        'storage/**',
        'var/**',
        'cache/**',
    ],
];
```

---

## Configuration Reference

| Configuration Option | Default | Description |
| :--- | :--- | :--- |
| **`'enabled'`** | `true` | Global master switch for runtime type enforcement. |
| **`'params'`** | `true` | Enforces parameter `@param` contracts on functions and methods. |
| **`'returns'`** | `true` | Enforces return `@return` contracts on functions and methods. |
| **`'respect_ignore_tags'`** | `true` | Respects `@typephp-ignore` and `@typephp-ignore-file` tags. Set to `false` in CI/CD to force audit checks. |
| **`'respect_native_nullability'`** | `true` | When `true` (default), permits `null` if native PHP explicitly declares nullable syntax (`?Type` or `Type\|null = null`) even if omitted in the DocBlock. Set to `false` for strict pedantic enforcement. |
| **`'magic_properties'`** | `true` | Enforces class-level `@property`, `@property-read`, and `@property-write` annotations on dynamic writes (`__set`). |
| **`'magic_methods'`** | `true` | Enforces class-level `@method` annotations on dynamic method calls (`__call` / `__callStatic`). |
| **`'array_validation'`** | `'full'` | Validation strategy for collections: `'full'` (exhaustive $O(n)$) or `'hybrid'` (Beartype $O(1)$ sampling for $> 64$ items). |
| **`'cache'`** | `true` | Pre-transforms and caches PHP files on disk. Set to `false` to transform files purely in memory (`php://memory`). |
| **`'cache_dir'`** | `null` | Custom path to store cached files. Defaults to system temporary directory (`sys_get_temp_dir() . '/typephp-cache/'`). |
| **`'extensions'`** | `[]` | Explicit list of third-party extension classes implementing `ExtensionInterface`. |
| **`'stubs'`** | `[]` | Path globs pointing to `.stub` files that override third-party vendor DocBlocks. |
| **`'inline_vars'`** | `[...]` | Fine-grained configuration for local `@var` variable validations. |
| **`'include'`** | `[...]` | Path globs to intercept and type-check. |
| **`'exclude'`** | `[...]` | Path globs to ignore and leave untouched. |

---

## Inline Variable Categories Reference (`inline_vars`)

You can toggle specific categories of local `@var` variable checks without disabling function boundary contracts:

| Category | Default | Description | Example |
| :--- | :--- | :--- | :--- |
| **`'properties'`** | `true` | Class property writes | `$this->id = 10;` |
| **`'generics'`** | `true` | Generic instance prebinding | `/** @var Collection<User> $users */` |
| **`'callables'`** | `true` | Inline callback wrapping | `/** @var callable(int): string $cb */` |
| **`'scalars'`** | `true` | Scalar refinements | `/** @var positive-int $count */` |
| **`'arrays'`** | `true` | Array shapes, lists, and maps | `/** @var array{id: int} $user */` |
| **`'objects'`** | `true` | Direct class instance checks | `/** @var User $user */` |

---

## Path Specificity & Whitelisting Rules

TypePHP resolves overlapping `include` and `exclude` paths by calculating **pattern specificity length**:

$$\text{Winning Rule} = \max(\text{Pattern Length})$$

* **Specific Vendor Whitelisting:** `'vendor/my-org/my-package/**'` (length 29) overrides the broader `'vendor/**'` exclusion (length 8).
* **Single-File Blacklisting:** `'src/Legacy/UnsafeFile.php'` (length 25) overrides the broader `'src/**'` inclusion (length 6).
* **Equal Length Tie-Breaker:** If pattern lengths are equal, `exclude` takes precedence to guarantee safety.

---

## Emergency Kill-Switches

To disable TypePHP immediately without modifying application code:

1. **Environment Level (Zero Overhead):** Set `TYPEPHP_DISABLE=true` in your server environment or `.env` file before autoloading.
2. **Config Level (Pass-Through):** Set `'enabled' => false` in `typephp.php` or call `TypePHP::setConfig(['enabled' => false])`.