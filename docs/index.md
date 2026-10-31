---
layout: home

hero:
  name: "TypePHP"
  text: "Transparent Runtime Type Enforcement"
  tagline: "The first pure userland PHP library to transparently enforce DocBlock types at runtime. Bringing reified generics, typed arrays, and 1-pass audit reporting to life with zero new syntax, zero build steps, and zero C-extensions."
  actions:
    - theme: brand
      text: "Try in Playground"
      link: /playground
    - theme: alt
      text: "Get Started →"
      link: /docs/getting-started/installation
    - theme: alt
      text: "View on GitHub"
      link: https://github.com/typephp-php/typephp

features:
  - title: "Interactive Browser Playground"
    details: "Test TypePHP live in your browser powered by real PHP 8.5 WebAssembly. Inspect zero line-drift AST transformations in real time with zero installation."
  - title: "1-Pass Audit & Violation Reporting"
    details: "Audit existing codebases in a single test run without crashing. Export structured JSON reports, run multi-worker parallel shards, and gate CI builds effortlessly."
  - title: "True Reified Generics"
    details: "Statefully reifies generic templates per object instance in memory using native WeakMap tracking, with full support for variance, nested generics, and clone preservation."
  - title: "Zero Line-Drift & Total Compatibility"
    details: "100% drop-in compatible with any existing PHP 8.1+ codebase (Laravel, Symfony, Shopware). Error traces in Ignition, Symfony, and Pest highlight the exact source line without drift."
---

::: tip Test Drive TypePHP Live in Your Browser (No Setup Required)
Want to see runtime reified generics and shape validation in action right now? Launch the **[Interactive WebAssembly Playground →](/playground)** running real PHP 8.5 in your browser. Experiment with presets, test your own edge cases, and inspect the transformed source code in real time!
:::

---

## See It In Action

TypePHP operates entirely in userland using native stream wrappers and AST transformations. Because it requires no C-extensions or FFI, you can drop it into any PHP 8.1+ project or web framework effortlessly. It reads your existing PHPDoc annotations and enforces them the moment your code runs.

---

### 1. True Runtime Generics with Reified Memory State

Define generic templates and TypePHP binds their state per object instance in memory using native `\WeakMap`.

Click **Run** below to watch TypePHP enforce generic boundaries live:

<TypePHPSnippet title="Runtime Reified Generics (WeakMap)" default-view="source">

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

// Prebind T = User to this specific object instance in memory
/** @var Collection<User> */
$users = new Collection();

// 1. Valid addition
$users->add(new User('Alice'));
echo "✓ Added User: {$users->items[0]->name}\n";
echo "✓ Reified Memory Type: " . TypePHP::getGenericType($users) . "\n\n";

// 2. Uncaught runtime violation: Product violates Collection<User>
echo "Attempting to add Product into Collection<User>...\n";
$users->add(new Product('SKU-100'));
```

</TypePHPSnippet>

---

### 2. Array Shapes & Key/Value Extractions

Enforce strict associative array structures and constant extractions:

<TypePHPSnippet title="Array Shapes & Constant Key Extractions" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class DatabaseMap
{
    public const DRIVERS = [
        'mysql' => 'PDO\MySQL\Driver',
        'pgsql' => 'PDO\PgSQL\Driver',
    ];
}

/**
 * @param array{
 *     driver: key-of<DatabaseMap::DRIVERS>,
 *     host: non-empty-string,
 *     port: int<1, 65535>
 * } $config
 */
function connectDatabase(array $config): void
{
    echo "✓ Connected via driver '{$config['driver']}' to {$config['host']}:{$config['port']}\n";
}

// 1. Valid connection payload
connectDatabase([
    'driver' => 'mysql',
    'host' => '127.0.0.1',
    'port' => 3306,
]);

echo "\n";

// 2. Invalid Driver: 'sqlite' is not a valid key of DatabaseMap::DRIVERS!
try {
    echo "Attempting to connect with unapproved driver 'sqlite'...\n";
    connectDatabase([
        'driver' => 'sqlite',
        'host' => '127.0.0.1',
        'port' => 3306,
    ]);
} catch (\TypeError $e) {
    echo "✗ Caught invalid driver key:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### 3. Non-Fatal Codebase Auditing & JSON Reports

Onboard TypePHP onto legacy codebases without fixing errors one crash at a time. Run your test suite in Audit Mode (`TYPEPHP_ON_VIOLATION=report`) to execute all tests to completion and capture every single type discrepancy across your application into a single structured JSON report:

```bash
# 1. Run your test suite in non-fatal Audit Mode
TYPEPHP_ON_VIOLATION=report TYPEPHP_REPORT_FILE=var/typephp-report.json ./vendor/bin/pest

# 2. View clean formatted summary table in your terminal
vendor/bin/typephp report
```

#### Terminal Audit Summary Output (`vendor/bin/typephp report`)
```text
  TYPEPHP  Violation Audit Report

  • Total Violations: 4
  • Files Affected:   3
  • Report Source:    var/typephp-report.json

  src/Services/PaymentService.php
    Line 42    parameter   $amount      expected positive-int, negative int (-50)

  src/Models/User.php
    Line 88    return      return       expected list<int>, App\Enums\Role returned
```

> **Learn More:** Check out the [Violation Reporting & Auditing](/docs/testing/violation-reporting) guide for full details on parallel worker sharding and CI gatekeeping (`fail_on_report`).

---

## Precise Call-Site Trace Attribution (Zero Line-Drift)

A common problem with AST code injection is that adding new statements pushes subsequent code down, causing line numbers in stack traces to drift out of sync.

TypePHP solves this with **Zero Line-Drift Formatting**. Injected guard rails are squashed onto single lines and appended directly to existing code blocks. **Line numbers in your source files remain 100% identical before and after transformation.**

When a type contract fails, web exception handlers (**Laravel Ignition, Whoops, Symfony ErrorHandler**) and CLI test runners (**Pest, PHPUnit**) point **directly to the exact line number** where the invalid assignment or return value occurred in your application code:

### Web Framework Trace (Laravel Ignition)
![Laravel Ignition Exception Trace](/screenshots/laravel-error-screen.png)

### Web Framework Trace (Symfony ErrorHandler)
![Symfony Exception Trace](/screenshots/symfony-error-screen.png)

### CLI Test Runner Trace (Pest PHP)
![Pest CLI Exception Trace](/screenshots/pestpest-error-screen.png)