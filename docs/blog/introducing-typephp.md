---
title: "The Death of the 'DocBlock Lie': Introducing TypePHP and Runtime Reified Generics in Pure PHP"
description: "How TypePHP turns modern PHPDocs into active runtime guard rails with zero build steps, zero transpilation, and zero new syntax."
date: 2026-08-18
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# The Death of the 'DocBlock Lie': Introducing TypePHP and Runtime Reified Generics in Pure PHP

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-announcement">Release</span>
  <span>August 18, 2026</span>
  <span class="dot">•</span>
  <span>3 min read</span>
</div>

For the past several years, the PHP ecosystem has undergone a massive renaissance. With tools like **PHPStan**, **Psalm**, and **Pest**, PHP developers now write some of the most strictly-typed, expresive codebases in the world.

We routinely write rich, descriptive DocBlocks:

```php
/**
 * @param positive-int $id
 * @param non-empty-string $email
 * @param Collection<User> $team
 * @param array{role: 'admin'|'editor', active: bool} $options
 */
function registerUser(int $id, string $email, Collection $team, array $options): void
```

**And yet, there is a fundamental elephant in the room.**

---

## The "DocBlock Lie" Problem

Because PHP's C-engine (the Zend Engine) ignores DocBlocks at runtime, those rich types are **passive comments**:

* An incoming HTTP JSON payload or database row can pass `$id = -50` or `$email = ''`.
* A third-party webhook can inject an unexpected key into what you assumed was a sealed array shape.
* A caller can pass `$team->add(new Product())` and pollute what was supposed to be a `Collection<User>`.

Native PHP type hints allow all of this through without a single warning. To defend against this, developers were historically forced to **litter their clean domain logic with repetitive assertion boilerplate**:

```php
// The old, cluttered way:
public function registerUser(int $id, string $email, Collection $team, array $options): void
{
    Assert::positiveInteger($id);
    Assert::nonEmptyString($email);
    Assert::allIsInstanceOf($team->toArray(), User::class);
    Assert::keyExists($options, 'role');
    
    // ... actual business logic is buried!
}
```

We asked ourselves: **Why should we write our types twice? What if our existing DocBlocks were living, executable laws at runtime?**

---

## Enter TypePHP

**[TypePHP](https://github.com/typephp-php/docs)** is a transparent, pure-PHP runtime type checker that turns your existing DocBlocks (`@param`, `@return`, `@var`, `@template`, `@property`, `@method`, array shapes, integer ranges, and scalar refinements) into **active runtime guard rails** during execution.

* **Zero New Syntax:** Write standard, clean PHP and standard PHPDocs.
* **Zero Build Steps & Zero Node.js:** No Babel, Webpack, or transpilation toolchains.
* **Zero C-Extensions:** Runs in 100% pure PHP userland across **PHP 8.1, 8.2, 8.3, 8.4, and 8.5** on Linux, macOS, and Windows.
* **Zero Line-Drift:** Injected guard rails are squashed onto opening braces so that error stack traces and Xdebug breakpoints match your source files **100% accurately**.

---

## How It Works: Load-Time Weaving via `StreamWrapper`

TypePHP utilizes a technique known in Aspect-Oriented Programming (AOP) as **Load-Time Weaving (LTW)**:

```
               HOW TYPEPHP WEAVES RUNTIME TYPE CHECKS

   require 'file.php' ──► [ TypePHP StreamWrapper ] ──► [ Injects AST Checks ] ──► [ OPcache RAM ]
                                                                                         │
                                                                                         ▼
                                                                                 Native C-Speed!
```

1. **Stream Interception:** When PHP loads a file, TypePHP's custom `file://` stream wrapper intercepts the file inclusion.
2. **Selective Path Filtering:** Un-included vendor packages pass through 100% raw and untouched, while application files are parsed into an Abstract Syntax Tree using `nikic/php-parser` and `phpstan/phpdoc-parser`.
3. **AST Guard-Rail Injection:** `ContractVisitor` traverses the AST and attaches single-line runtime type guards at method boundaries.
4. **OPcache Compilation:** Transformed files are saved to disk once. PHP's **OPcache compiles them directly into shared memory bytecode**, meaning AST parsing runs **0 times** on subsequent web requests.

---

## True Reified Generics in Pure PHP (`\WeakMap`)

Unlike languages that erase generic types at compile time (like Java or TypeScript), TypePHP delivers **Reified Generics** in memory using PHP's native `\WeakMap`:

```php
use App\Collections\Collection;
use App\Models\User;
use App\Models\Product;
use TypePHP\TypePHP;

/** @var Collection<User> $users */
$users = new Collection();

$users->add(new User('Alice')); // Valid

$users->add(new Product('SKU-100')); 
// Throws: TypeError: Collection::add(): Argument $item (template T = User) must be of type User, Product given
```

Because `\WeakMap` uses weak references, the exact microsecond `$users` is unset or goes out of scope, its generic bindings are **automatically deleted from RAM with zero memory leaks**.

You can even inspect generic parameters at runtime via the library's reified generics api:
```php
TypePHP::getGenericType($users); // Returns 'App\Models\User'
```

---

## Tooling Tag Priority Hierarchy (`@phpstan-*` > `@psalm-*` > `@*`)

Enterprise libraries (like **Doctrine Collections**, **Symfony**, and **Shopware**) often declare broad fallback annotations for IDEs and stricter annotations for static analyzers:

```php
/**
 * @param mixed $element            // Broad fallback for IDEs
 * @phpstan-param T $element         // Stricter generic contract
 */
public function add(mixed $element): void;
```

TypePHP automatically resolves tag priority: **`@phpstan-*` > `@psalm-*` > `@*`**. It prioritizes the stricter `@phpstan-param` contract automatically, allowing third-party collections (like Doctrine's `ArrayCollection<int, Animal>`) to enforce generic types at runtime with zero wrapper boilerplate.

---

## Call-Site Stack Trace Attribution (Zero Confusion)

When a type contract fails, TypePHP automatically rewrites the exception's file and line attributes via Reflection to blame **the exact line of code in the caller file where the invalid argument was passed**:

```text
TypePHP\Exception\TypeError: registerUser(): Argument $id must be of type positive-int, negative int (-50) given
in /app/Http/Controllers/UserController.php on line 24
```

Exception handlers (**Laravel Ignition, Symfony ErrorHandler, Whoops**) and test runners (**Pest, PHPUnit**) point directly to the line of code responsible for the violation.

---

## Real-World Enterprise Battle-Testing

TypePHP was recently tested on **Shopware 6** (one of the largest enterprise Symfony-based e-commerce platforms in the world), where it immediately surfaced real-world "DocBlock Lies" in legacy methods—such as database migration queues promising `list<string>` while SQL timestamps physically produced `int (1536232600)`.

Catching these discrepancies at runtime ensures that API schemas, database writes, and OpenAPI documentation stay 100% honest and bug-free.

---

## Getting Started in 30 Seconds

Install TypePHP as a development dependency for your local testing and CI/CD pipelines:

```bash
composer require --dev typephp/typephp
```

Generate your default configuration:

```bash
vendor/bin/typephp config:init
```

Now, run your exiting test suite or application:

```bash
php artisan serve
```

```bash
symfony serve
```

```bash
./vendor/bin/phpunit
```

```bash
./vendor/bin/pest
```

Every function contract, array shape, integer range, and generic container in your application is now actively defended by runtime type safety!

---

### Resources & Links

* **[Documentation Website »](/getting-started/installation)**
* **[Quick Start Guide »](/getting-started/quick-start)**
* **[Generics Deep Dive »](/generics/basics-and-bounds)**
* **[GitHub Repository »](https://github.com/typephp-php/docs)**