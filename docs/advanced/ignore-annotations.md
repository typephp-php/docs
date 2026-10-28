# Ignore Annotations (`@typephp-ignore`)

TypePHP provides docblock suppression tags to skip type enforcement on legacy code, un-refactored methods, performance-critical loops, or test callers without requiring you to remove PHPDoc annotations.

---

## Function & Method Level Suppression (`@typephp-ignore`)

Add `@typephp-ignore` (or `@typephp-disable`) to a function or class method docblock to skip contract enforcement for that specific function while keeping all other methods in the same class 100% type-checked:

<TypePHPSnippet title="Method-Level Suppression (@typephp-ignore)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class UserService
{
    /**
     * Active Type Checking (Normal Method)
     *
     * @param positive-int $id
     * @return array{id: positive-int}
     */
    public function findUser(int $id): array
    {
        return ['id' => $id];
    }

    /**
     * Ignored Method: Type-checking skipped for this method only!
     *
     * @typephp-ignore
     * @param positive-int $id
     * @return array{id: positive-int}
     */
    public function legacyImport(int $id): array
    {
        // Enforcing positive-int is completely skipped here!
        return ['id' => $id];
    }
}

$service = new UserService();

// 1. Valid Call on normal method
$res = $service->findUser(42);
echo "✓ Normal method verified: ID={$res['id']}\n\n";

// 2. Ignored Method: Passes negative integer -500 without error!
$legacy = $service->legacyImport(-500);
echo "✓ Ignored legacy method accepted invalid ID={$legacy['id']} without error\n\n";

// 3. Normal method strictly rejects negative integer
try {
    echo "Attempting to pass negative ID into un-ignored findUser()...\n";
    $service->findUser(-10);
} catch (\TypeError $e) {
    echo "✗ Un-ignored method caught invalid argument:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Caller-Level & Deep Stack Trace Suppression

In addition to tagging the target method itself, you can tag an **enclosing caller** (such as a test method, controller action, or pipeline handler) with `@typephp-ignore`.

When a type contract violation occurs anywhere downstream, TypePHP scans up the call stack. If any enclosing caller in the execution chain is marked with `@typephp-ignore` or `@typephp-disable`, the error is suppressed:

<TypePHPSnippet title="Caller-Level Downstream Suppression" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class PaymentService
{
    /**
     * Downstream service method: strictly requires positive-int!
     *
     * @param positive-int $amount
     */
    public function charge(int $amount): void
    {
        echo "Processing charge: \${$amount}\n";
    }
}

class PipelineRunner
{
    public function __construct(private PaymentService $service) {}

    /**
     * Enclosing Caller: Tagged with @typephp-ignore!
     * Any type violations triggered downstream by this method are suppressed.
     *
     * @typephp-ignore
     */
    public function testNegativePipeline(): void
    {
        // Calling downstream method with invalid negative amount:
        $this->service->charge(-100);
    }

    /**
     * Normal Caller: Not ignored!
     */
    public function standardPipeline(): void
    {
        $this->service->charge(-250);
    }
}

$service = new PaymentService();
$pipeline = new PipelineRunner($service);

// 1. Downstream failure suppressed by caller's @typephp-ignore tag:
$pipeline->testNegativePipeline();
echo "✓ Downstream violation suppressed by enclosing caller tag\n\n";

// 2. Normal caller without ignore tag triggers TypeError from downstream:
try {
    echo "Executing normal pipeline caller with negative charge...\n";
    $pipeline->standardPipeline();
} catch (\TypeError $e) {
    echo "✗ Un-ignored caller triggered downstream failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

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

### Customizing the Frame Window in `typephp.php`

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

### Interactive Demo: Deep Recursion & `ignore_trace_depth`

The interactive snippet below simulates a deep execution chain using a recursive helper. 

Notice that this snippet is configured with a shallow inspection window of **`ignoreTraceDepth: 5`**:
1. The caller `testCallerWithIgnore()` is tagged with `@typephp-ignore`.
2. It recurses down **8 frames** deep before calling `executeStrictTarget(-99)`.
3. Because the ignore tag sits 9 frames above the failure, an `ignore_trace_depth` of 5 **cannot reach it**, so TypePHP catches and throws the error!

<TypePHPSnippet 
  title="Recursive Call-Stack Depth & Search Window" 
  :config="{ ignoreTraceDepth: 5 }" 
  default-view="source"
>

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Target method strictly expecting positive-int:
 *
 * @param positive-int $value
 */
function executeStrictTarget(int $value): void
{
    echo "✓ Target executed with: {$value}\n";
}

/**
 * Recursive helper to generate stack frames:
 */
function recurseFrames(int $depth): void
{
    if ($depth <= 1) {
        // Failing call executed at depth!
        executeStrictTarget(-99);
        return;
    }

    recurseFrames($depth - 1);
}

/**
 * Originating Caller tagged with @typephp-ignore:
 *
 * @typephp-ignore
 */
function testCallerWithIgnore(): void
{
    // Generate 8 stack frames down to the target:
    recurseFrames(8);
}

// With ignoreTraceDepth = 5, the search window cannot reach 8+ frames up:
try {
    echo "Running 8-frame deep call with ignoreTraceDepth = 5...\n";
    testCallerWithIgnore();
    echo "✓ Suppressed successfully!\n";
} catch (\TypeError $e) {
    echo "✗ Failed to find ignore tag within 5 stack frames:\n   " . $e->getMessage() . "\n\n";
    echo "👉 TRY THIS INTERACTIVE CHALLENGE:\n";
    echo "1. Click the [⚙️ Config] button in the toolbar above.\n";
    echo "2. Find 'Ignore Trace Depth' and increase it from 5 to 10 (or above).\n";
    echo "3. Click [Run] again!\n";
    echo "4. Watch the error disappear as TypePHP successfully reaches the @typephp-ignore tag!\n";
}
```

</TypePHPSnippet>

---

## Property & Property Hook Suppression (`@typephp-ignore`)

Add `@typephp-ignore` to a class property or PHP 8.4 property hook docblock to skip property assignment and hook validation:

<TypePHPSnippet title="Property & Property Hook Suppression" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

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

// 1. Ignored property assignment passes negative integer without error:
$profile->unvalidatedId = -500;
echo "✓ Ignored property assigned invalid value: {$profile->unvalidatedId}\n";

// 2. Ignored property hook assignment passes negative integer without error:
$profile->unvalidatedHook = -250;
echo "✓ Ignored property hook assigned invalid value: {$profile->unvalidatedHook}\n\n";

// 3. Normal property assignment strictly rejects negative integer
try {
    echo "Attempting to assign negative value to normal property...\n";
    $profile->id = -99;
} catch (\TypeError $e) {
    echo "✗ Normal property caught invalid assignment:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## File-Level Suppression (`@typephp-ignore-file`)

Place `@typephp-ignore-file` (or `@typephp-disable-file`) in a docblock at the top of a PHP file to skip AST transformation and type-checking for the entire file:

<TypePHPSnippet title="File-Level Suppression (@typephp-ignore-file)" default-view="source">

```php:line-numbers
<?php

/**
 * @typephp-ignore-file
 */

declare(strict_types=1);

class LegacyCalculator
{
    /**
     * @param positive-int $a
     * @param positive-int $b
     * @return positive-int
     */
    public function add(int $a, int $b): int
    {
        return $a + $b;
    }
}

$calc = new LegacyCalculator();

// Because the entire file has @typephp-ignore-file,
// TypePHP completely bypasses AST transformation on this file.
// Passing negative numbers runs at 100% native PHP C-speed without checks:
$result = $calc->add(-50, -25);
echo "✓ Entire file ignored: Result={$result} (zero checks executed)\n";
```

</TypePHPSnippet>

> **Technical Note & Coding Convention:** Under the hood, TypePHP scans the raw file contents for `@typephp-ignore-file` before performing AST transformations, meaning the tag will function regardless of its position in the file. However, you should always place `@typephp-ignore-file` at the very top of the file (right after `<?php`) as a clean coding convention.

---

## Forcing Audits in CI/CD (`respect_ignore_tags => false`)

During automated CI/CD builds or security audits, you can force TypePHP to **bypass all ignore tags** and type-check every method and file containing `@typephp-ignore` without modifying source code.

Set `'respect_ignore_tags' => false` in your `typephp.php` configuration or dynamically in test setup:

```php
// In a CI/CD test setup or script:
TypePHP::setConfig(['respect_ignore_tags' => false]);
```

The interactive snippet below is initialized with `:config="{ respectIgnoreTags: false }"`. Notice that the `@typephp-ignore` tag is **overridden**, causing the legacy call to be strictly validated and caught:

<TypePHPSnippet 
  title="Forcing Full Audit (respect_ignore_tags: false)" 
  :config="{ respectIgnoreTags: false }" 
  default-view="source"
>

```php:line-numbers
<?php

declare(strict_types=1);

class AuditService
{
    /**
     * Annotated with @typephp-ignore:
     *
     * @typephp-ignore
     * @param positive-int $id
     */
    public function legacySync(int $id): void
    {
        echo "Synced: {$id}\n";
    }
}

$service = new AuditService();

// When respect_ignore_tags is false, TypePHP ignores the @typephp-ignore tag!
// The method is strictly type-checked and catches the legacy bug:
try {
    echo "Executing legacySync(-42) during strict CI audit run...\n";
    $service->legacySync(-42);
} catch (\TypeError $e) {
    echo "✗ Strict audit caught suppressed legacy bug:\n   " . $e->getMessage() . "\n";
    echo "  (Tip: Click ⚙️ Config above, toggle 'Respect Ignore Tags' ON, and run again to see it pass!)\n";
}
```

</TypePHPSnippet>

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