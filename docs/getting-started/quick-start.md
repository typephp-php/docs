# Quick Start Guide

TypePHP enforces PHPDoc type contracts at runtime during execution. Below is an overview of core concepts, framework setup, and interactive code examples.

---

## What is TypePHP?

TypePHP is a transparent, pure-PHP runtime type checker that enforces extended PHPDoc type contracts (`@param`, `@return`, `@var`, `@template`, `@property`, `@method`, array shapes, integer ranges, and scalar refinements) during actual execution. 

Unlike traditional assertion libraries that force you to write repetitive manual check calls inside every function, or validation frameworks that require custom PHP attributes and base classes, TypePHP requires **zero manual checks** and **zero new syntax**. It works transparently using your existing PHPDoc annotations.

---

## What Problem Does It Solve?

While native PHP type hints (such as `int $id` or `string $name`) enforce basic scalar types, PHP's C-engine ignores PHPDoc annotations at runtime. This creates a dangerous safety gap at application boundaries:

- **Un-sanitized Dynamic Payloads:** HTTP API requests, Stripe webhooks, database query results, and JSON inputs frequently contain data that native PHP type hints allow through (such as passing a negative integer `-50` into a parameter expecting a `positive-int`).
- **The "DocBlock Lie" Problem:** Developers write DocBlocks assuming they are accurate, but dynamic runtime callers can pass invalid data that bypasses native PHP type hints, polluting database state or causing silent bugs.
- **Manual Validation Boilerplate:** Traditional runtime checkers force you to write imperative assertion calls (`Assert::positiveInteger($id)`) inside every function body or introduce custom attributes (`#[Validate]`). TypePHP removes all manual boilerplate by reading standard PHPDocs automatically.
- **Boundary Testing in Pest & PHPUnit:** TypePHP physically verifies that your application boundaries withstand real-world dynamic data during local testing and CI/CD runs.

---

## Progressive Adoption (Not All-or-Nothing)

TypePHP does not force you into an "all-or-nothing" paradigm. You do not have to type-check your entire codebase or refactor legacy modules overnight. You can adopt TypePHP progressively at whatever granularity fits your project:

- **Path-Level Whitelisting:** Use `include` patterns in `typephp.php` to target specific mission-critical domain modules (such as `app/Domain/Billing/**`) while completely bypassing legacy directories.
- **Method-Level Suppression:** Add `@typephp-ignore` to specific legacy methods or un-refactored functions without removing their PHPDoc annotations.
- **Category-Level Feature Toggles:** Granularly enable or disable specific check categories (`inline_vars.scalars`, `inline_vars.arrays`, `params`, `returns`, `magic_properties`, `magic_methods`) in `typephp.php` depending on performance or migration needs.

---

## Runtime Enforcement vs. Static Analysis (Partners, Not Replacements)

TypePHP is **not a replacement** for static analysis tools like PHPStan, Psalm, Mago, or Phan. They are complementary partners designed to work together:

- **Static Analysis (Compile-Time & IDE):** Lints your source code structure offline in your IDE and CI pipeline, catching static logic errors before your code ever runs.
- **TypePHP (Runtime & Execution):** Validates actual dynamic data in RAM during execution, ensuring that incoming API payloads, database results, and test suite inputs strictly satisfy your PHPDoc contracts.

> **Recommended Workflow:** Use PHPStan or Psalm in your IDE to lint code syntax, and use TypePHP during Pest/PHPUnit test runs and CI pipelines to guarantee runtime data integrity.

---

## Zero-Overhead on Proven Code (Compile-Time Check Elimination)

A common concern with runtime type checking is execution overhead. To keep performance near native speeds, TypePHP does **not** blindly wrap every line of code with runtime assertion functions.

During file transformation, TypePHP performs **compile-time AST analysis** (`eliminate_statically_proven_checks => true`). If a statement is mathematically or logically proven to satisfy its DocBlock contract at compile time, **TypePHP omits runtime checks entirely**:

```php:line-numbers
class UserService
{
    /** @var positive-int */
    public int $timeout = 30; // Proven valid -> Zero constructor checks injected!

    /** @return non-empty-string */
    public function getVersion(): string
    {
        return '2.0.0'; // Literal string -> Injected check is completely omitted!
    }

    /** @return list<int> */
    public function getEmptyDefaults(): array
    {
        return []; // Empty array -> Proven list<int> -> Check omitted!
    }

    /** @return $this */
    public function enableFeature(): self
    {
        $this->active = true;
        return $this; // $this identity -> Check omitted! Fluent chaining runs at native speed.
    }
}
```

- **Statically Proven Code:** Runs at **100% native PHP C-speed** with single `ZEND_RETURN` opcodes and zero runtime function calls.
- **Dynamic Code:** Incoming API parameters, database query results, and variables containing runtime data are strictly intercepted and verified.

::: tip Deep Dive into Check Elimination
To learn more about how `StaticTypeEvaluator`, `ArrayLiteralEvaluator`, and `ScalarEvaluator` optimize bytecode, check out the dedicated [Compile-Time Check Elimination Guide](/advanced/compile-time-elimination).
:::

---

## Execution & Framework Entry Points

Because TypePHP integrates directly with Composer's autoloader (`vendor/autoload.php`), you don't always need to run code through the custom CLI binary.

### Frameworks, Consoles & Test Runners
If your application executes through a standard entry point—such as a web framework's **`public/index.php`**, Laravel's **`artisan`** console, or test runners like **`pest`** and **`phpunit`**—TypePHP boots automatically out of the box.

In this mode, TypePHP transparently intercepts, transforms, and enforces types on any PHP file matching the `include` paths defined in your `typephp.php` configuration file.

### Standalone Scripts (`vendor/bin/typephp <script.php>`)
For standalone scripts, benchmarks, or one-off files executed directly from the terminal, run them using the TypePHP CLI binary:

```bash
vendor/bin/typephp script.php
```

When invoked this way, the CLI runner automatically type-checks the specified file **even if it is not registered in `typephp.php` or falls outside your configured `include` paths**. Any secondary dependencies required or included by the script will continue to respect your project's configured `include` and `exclude` paths.

---

## Namespace & Import Resolution

TypePHP is fully aware of your file's namespace context and `use` import statements. You can write your docblocks using short imported names, relative names, aliased imports, or Fully Qualified Class Names (FQCN), and TypePHP will resolve them perfectly at runtime:

```php:line-numbers
<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Billing as BillingService;

/**
 * @param User $user                       // Resolved via use import
 * @param BillingService\Invoice $invoice  // Resolved via aliased import
 * @param \DateTimeImmutable $date         // Resolved via FQCN
 */
function processPayment(object $user, object $invoice, object $date): void 
{
    // ...
}
```

---

## Interactive Examples: Try Them Live

All code blocks below are interactive! Click **Run** to execute them live in your browser powered by real PHP 8.5 WebAssembly, or toggle **Transformed** to view the compiled AST code.

---

## Parameter Contracts (`@param`)

Write standard PHPDoc annotations on function or method parameters. In the snippet below, passing `-5` triggers an immediate runtime `TypeError`:

<TypePHPSnippet title="Function Parameter Contract Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int $id
 * @param non-empty-string $username
 */
function processUser(int $id, string $username): void
{
    echo "✓ Verified User #{$id}: {$username}\n";
}

// 1. Valid Call
processUser(42, 'Alice');

// 2. Invalid Call: Passing negative integer violates positive-int!
echo "Calling processUser with invalid ID -5...\n";
processUser(-5, 'Alice');
```

</TypePHPSnippet>

> **Execution Order Note:** Native PHP type hints (e.g., `int $id`, `string $username`) are evaluated by PHP's C-engine before function execution begins. TypePHP's extended DocBlock contracts (e.g., `positive-int`, `non-empty-string`) execute at function entry. If a native type hint fails, PHP throws its native `TypeError` before TypePHP guard rails execute.

---

## Return Contracts (`@return`)

TypePHP validates function return values before they are returned to the caller:

<TypePHPSnippet title="Function Return Contract Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @return array{id: positive-int, status: 'active'|'pending'}
 */
function fetchUserData(int $id): array
{
    if ($id <= 0) {
        // Bug! Returns negative id violating positive-int contract:
        return ['id' => $id, 'status' => 'active'];
    }

    return ['id' => $id, 'status' => 'active'];
}

// Valid Call
$user = fetchUserData(100);
echo "✓ Fetched User #{$user['id']} (Status: {$user['status']})\n\n";

// Invalid Call: Returns negative ID!
echo "Calling fetchUserData(-10)...\n";
fetchUserData(-10);
```

</TypePHPSnippet>

---

## Typed Arrays, Lists, and Shapes

Enforce strict structure on arrays, sequential lists, key-value maps, and shapes:

<TypePHPSnippet title="Typed Lists and Array Shapes" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param list<positive-int> $scores
 * @param array<string, non-empty-string> $headers
 */
function processBatch(array $scores, array $headers): void
{
    echo "✓ Processed batch with " . count($scores) . " score(s)\n";
}

// 1. Valid Call
processBatch([10, 20, 30], ['Authorization' => 'Bearer token']);

// 2. Invalid Call: Associative array passed where list was expected!
echo "Passing associative array where list was expected...\n";
processBatch(['score_1' => 10], ['Authorization' => 'Bearer token']);
```

</TypePHPSnippet>

---

## Inline Variable Validation (`@var`)

Validate local variable assignments and compound operations inside function bodies:

<TypePHPSnippet title="Inline Variable Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int $age */
$age = 25; // Valid
echo "✓ Initial Age: {$age}\n";

$age += 5; // Valid compound addition ($age = 30)
echo "✓ Age after increment: {$age}\n\n";

// Compound multiplication produces negative number, violating positive-int!
echo "Multiplying age by -1...\n";
$age *= -1;
```

</TypePHPSnippet>

---

## Runtime Generics with `\WeakMap`

TypePHP statefully binds generic template types (`T`) directly to object instances in memory using native `\WeakMap`:

<TypePHPSnippet title="Runtime Reified Generics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

class User { public function __construct(public string $name) {} }
class Product { public function __construct(public string $sku) {} }

/**
 * @template T
 */
class Collection 
{
    /** @var array<int, T> */
    public array $items = [];

    /** @param T $item */
    public function add(mixed $item): void 
    {
        $this->items[] = $item;
    }
}

/** @var Collection<User> $users */
$users = new Collection();

$users->add(new User('Alice')); // Valid
echo "✓ Added User: {$users->items[0]->name}\n";
echo "✓ Reified Memory Type: " . TypePHP::getGenericType($users) . "\n\n";

// Product violates Collection<User> bound in WeakMap memory!
echo "Attempting to add Product into Collection<User>...\n";
$users->add(new Product('SKU-100'));
```

</TypePHPSnippet>

---

## Class-Level Magic Annotations (`@property` & `@method`)

TypePHP validates dynamic property writes (`__set`) and dynamic method calls (`__call`) against class-level `@property` and `@method` annotations:

<TypePHPSnippet title="Magic Annotations (@property & @method)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @phpstan-type StatusUnion 'active'|'pending'
 *
 * @property positive-int $score
 * @method bool updateStatus(StatusUnion $status)
 */
class DynamicModel
{
    private array $storage = [];

    public function __set(string $name, mixed $value): void
    {
        $this->storage[$name] = $value;
    }

    public function __call(string $name, array $arguments): mixed
    {
        return true;
    }
}

$model = new DynamicModel();

// 1. Valid assignments
$model->score = 100;
$model->updateStatus('active');
echo "✓ Score and status updated\n\n";

// 2. Invalid dynamic property write ($score = -50 violates positive-int)
echo "Assigning negative score to magic property...\n";
$model->score = -50;
```

</TypePHPSnippet>

---

## PHP 8.4 Property Hooks & Asymmetric Visibility

TypePHP validates incoming values on `set` hooks and returned values on `get` hooks:

<TypePHPSnippet title="PHP 8.4 Property Hooks" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class UserProfile
{
    /** @var positive-int */
    public private(set) int $id = 10;

    /** @var non-empty-string */
    public string $username {
        get => $this->_username;
        set => $this->_username = trim($value);
    }

    private string $_username = 'Alice';
}

$profile = new UserProfile();
$profile->username = '  Bob  ';
echo "✓ Username set: {$profile->username}\n\n";

// Setting empty string violates non-empty-string on property hook!
echo "Assigning empty string to hooked property...\n";
$profile->username = '';
```

</TypePHPSnippet>

---

## By-Reference Contracts & In-Place Mutations

TypePHP actively protects all by-reference boundaries (`&$param`, `@param-out`, `$alias =& $var`, `$ref =& $obj->prop`, and by-reference `foreach` loops):

<TypePHPSnippet title="By-Reference Mutation Protection" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int $score */
$score = 10;

// Alias $score by reference
$alias =& $score;

$alias += 5; // Valid (Score is 15)
echo "✓ Score via alias: {$score}\n\n";

// Mutating alias violates positive-int on the underlying variable!
echo "Assigning negative score via reference alias...\n";
$alias = -30;
```

</TypePHPSnippet>

::: tip Complete By-Reference Guide
To learn more about out-parameters (`@param-out`), by-reference `foreach` guards, and `CallableWrapper` signature-aware dispatching, read the dedicated [By-Reference Contracts & Mutations Guide](/core-concepts/by-reference-contracts).
:::

---

## Suppressing Type Checks (`@typephp-ignore` & `@typephp-ignore-file`)

TypePHP provides annotations to skip type enforcement on legacy code or performance-critical sections without removing docblock types.

### Function & Method Level Suppression

Add `@typephp-ignore` to a function or class method docblock to skip type-checking for that specific function:

```php:line-numbers
/**
 * @typephp-ignore
 * @param positive-int $id
 */
function legacyProcess(int $id): void
{
    // TypePHP skips type enforcement for this specific function
}

legacyProcess(-500); // Passes without error
```

### File-Level Suppression

Place `@typephp-ignore-file` in a file-level docblock at the top of a file:

```php:line-numbers
<?php

/**
 * @typephp-ignore-file
 */

declare(strict_types=1);

namespace App\Legacy;

// All functions, methods, and properties in this file are skipped by TypePHP
```

> **Technical Note & Coding Convention:**
> Under the hood, TypePHP scans the raw file contents for `@typephp-ignore-file` before performing AST transformations, meaning the tag will function regardless of its position in the file. However, you should always place `@typephp-ignore-file` at the very top of the file (right after `<?php`) as a clean coding convention.
