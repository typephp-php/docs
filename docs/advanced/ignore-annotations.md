# Ignore Annotations (`@typephp-ignore`)

TypePHP provides docblock suppression tags to skip type enforcement on legacy code, un-refactored methods, performance-critical loops, or test callers without requiring you to remove PHPDoc annotations.

---

## File-Level Suppression (`@typephp-ignore-file`)

Place `@typephp-ignore-file` (or `@typephp-disable-file`) in a docblock at the top of a PHP file to skip AST transformation and type-checking for the entire file:

```php
<?php

/**
 * @typephp-ignore-file
 */

declare(strict_types=1);

namespace App\Legacy;

class UnfactoredLegacyService
{
    /**
     * @param positive-int $id
     */
    public function process(int $id): void
    {
        // Type-checking is completely skipped for all code in this file!
    }
}
```

> **Technical Note & Coding Convention:** Under the hood, TypePHP scans the raw file contents for `@typephp-ignore-file` before performing AST transformations, meaning the tag will function regardless of its position in the file. However, you should always place `@typephp-ignore-file` at the very top of the file (right after `<?php`) as a clean coding convention.

---

## Function & Method Level Suppression (`@typephp-ignore`)

Add `@typephp-ignore` (or `@typephp-disable`) to a function or class method docblock to skip contract enforcement for that specific function while keeping all other methods in the same class 100% type-checked:

```php
namespace App\Services;

class UserService
{
    /**
     * Active Type Checking
     *
     * @param positive-int $id
     */
    public function findUser(int $id): array
    {
        return ['id' => $id];
    }

    /**
     * Ignored Method - Type-checking skipped for this method only!
     *
     * @typephp-ignore
     * @param positive-int $id
     */
    public function legacyImport(int $id): void
    {
        // ...
    }
}

$service = new UserService();

// Normal method still enforces positive-int
$service->findUser(-5);
// Throws: TypeError: UserService::findUser(): Argument $id must be of type positive-int

// Ignored method skips type-checking!
$service->legacyImport(-500); // Passes without error
```

---

## Caller-Level & Deep Stack Trace Suppression

In addition to tagging the target method itself, you can tag an **enclosing caller** (such as a test method, controller action, or pipeline handler) with `@typephp-ignore`.

When a type contract violation occurs anywhere downstream, TypePHP scans up the call stack. If any enclosing caller in the execution chain is marked with `@typephp-ignore` or `@typephp-disable`, the error is suppressed:

```php
namespace Tests\Feature;

use App\Services\PaymentService;

class PaymentPipelineTest
{
    /**
     * Deliberately pass invalid data through the pipeline for edge-case testing.
     * Any type failure triggered downstream by this test method will be suppressed!
     *
     * @typephp-ignore
     */
    public function testNegativeBalanceHandling(): void
    {
        $service = new PaymentService();

        // Downstream method expects positive-int, but is suppressed by the caller's ignore tag
        $service->charge(-100); 
    }
}
```

---

## Configuring Call Stack Depth (`ignore_trace_depth`)

Modern PHP applications often route requests through multiple abstraction layers (middleware pipelines, command buses, event dispatchers, or serializer pipelines) where the failing check may execute 10 to 20+ frames below the originating caller:

```
[Your Test or Controller Method] (Tagged with @typephp-ignore)
       │  Frame 22
       ▼
[Command Bus / Pipeline Runner]
       │  Frame 15
       ▼
[Middleware Interceptor Stack]
       │  Frame 8
       ▼
[Serializer / Normalizer Dispatcher]
       │  Frame 3
       ▼
[Target Service Method] ──► Fails type contract!
```

By default, TypePHP inspects up to **`25`** stack frames above a failing check to find an enclosing `@typephp-ignore` tag.

### Customizing the Frame Window

If your architecture uses deep pipelines, command buses, or recursive execution, you can expand the search window in `typephp.php`:

```php
// typephp.php
return [
    /*
    |--------------------------------------------------------------------------
    | Ignore Tag Stack Trace Depth
    |--------------------------------------------------------------------------
    | Controls how many stack frames above a failing type check TypePHP will
    | inspect to find an enclosing @typephp-ignore or @typephp-disable tag.
    | Default is 25 frames. Increase this for deep architectures or pipelines.
    */
    'ignore_trace_depth' => 40,
];
```

You can also adjust the depth dynamically for specific tests or benchmark suites:

```php
TypePHP::setConfig(['ignore_trace_depth' => 50]);
```

> **Performance Guarantee (Zero Happy-Path Overhead):**  
> TypePHP **never** inspects the call stack during successful executions. The stack trace is only generated and traversed when a contract violation actually occurs, and verified callers are memoized with $O(1)$ in-memory caching.

---

## Property & Property Hook Suppression (`@typephp-ignore`)

Add `@typephp-ignore` to a class property or PHP 8.4 property hook docblock to skip property assignment and hook validation:

```php
class UserProfile
{
    /**
     * Normal Property - Validated on assignment
     *
     * @var positive-int
     */
    public int $id = 10;

    /**
     * Ignored Property - Type-checking skipped
     *
     * @typephp-ignore
     * @var positive-int
     */
    public int $unvalidatedId = 10;

    /**
     * Ignored Property Hook - Hook validation skipped
     *
     * @typephp-ignore
     * @var positive-int
     */
    public int $unvalidatedHook {
        get => $this->_val;
        set => $this->_val = $value;
    }

    public int $_val = 10;
}

$profile = new UserProfile();

// Ignored property assignment passes -500 without error!
$profile->unvalidatedId = -500;

// Ignored property hook assignment passes -500 without error!
$profile->unvalidatedHook = -500;
```

---

## Forcing Audits in CI/CD (`respect_ignore_tags => false`)

During automated CI/CD builds or security audits, you can force TypePHP to **bypass all ignore tags** and type-check every method and file containing `@typephp-ignore` without modifying source code.

Set `'respect_ignore_tags' => false` in your `typephp.php` configuration or dynamically in test setup:

```php
// In a CI/CD test setup or script:
TypePHP::setConfig(['respect_ignore_tags' => false]);

// All @typephp-ignore methods and files will now be strictly type-checked!
```

> **Path Exclusions vs. DocBlock Suppression:**  
> Setting `'respect_ignore_tags' => false` ONLY overrides DocBlock annotations (`@typephp-ignore` and `@typephp-ignore-file`).
> 
> Files or directories blacklisted in your `typephp.php` configuration (`'exclude' => ['vendor/**', 'src/Legacy/**']`) remain **unconditionally excluded**. Path-level exclusions in configuration are never overridden by `respect_ignore_tags`.

---

## Summary of Ignore Annotations & Options

| Annotation / Option | Target Scope | Behavior |
| :--- | :--- | :--- |
| **`@typephp-ignore-file`**, **`@typephp-disable-file`** | File Header | Skips AST transformation and type checks for the entire file. |
| **`@typephp-ignore`**, **`@typephp-disable`** | Function / Method | Skips contract enforcement for the annotated function or method. |
| **`@typephp-ignore`**, **`@typephp-disable`** | Caller / Test Method | Suppresses downstream type violations triggered by this caller up to `ignore_trace_depth` frames below. |
| **`@typephp-ignore`**, **`@typephp-disable`** | Property / Hook | Skips property assignment and hook validation. |
| **`'ignore_trace_depth'`** | `typephp.php` | Configures the maximum call stack frame depth (default: `25`) inspected to find an enclosing ignore tag. |
| **`'respect_ignore_tags'`** | `typephp.php` | Global master toggle for ignore tags. Set to `false` in CI/CD to force full type enforcement. |
