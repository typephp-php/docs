---
title: "How to Enforce Runtime Generics on Third-Party Collections Libraries (Doctrine, Ramsey, Laravel Collections) with TypePHP"
description: "A comprehensive guide on making third-party collections reified and strictly type-checked at runtime across Symfony, Laravel, PHPUnit, and Pest."
date: 2026-08-18
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# How to Enforce Runtime Generics on Third-Party Collections (eg. Doctrine, Ramsey) with TypePHP

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-guide">Guide</span>
  <span>August 18, 2026</span>
  <span class="dot">•</span>
  <span>6 min read</span>
</div>

In modern PHP development, third-party collection libraries like **Doctrine Collections** (`doctrine/collections`) and **Ramsey Collections** (`ramsey/collection`) are among the industry standard for managing entity lists, dictonaries, and aggregate collections.

However, writing generic annotations on collections in standard PHP comes with **three fundamental challenges**:

---

## The Reality of Generics in Standard PHP

### 1. PHP Stays Completely Silent on Type Violations
In standard PHP execution, the Zend Engine knows nothing about generics. If you annotate a collection as `Collection<User>` and someone accidentally pushes a `Product` or an un-sanitized array, **PHP will not complain, throw an error, or issue a warning**:

```php
// Standard PHP: Accidentally adds a Product to a list of Users
$users = new ArrayCollection();
$users->add(new User('Alice'));
$users->add(new Product('SKU-100')); // PHP stays 100% silent!
```
The invalid object travels silently through your application until it causes a bug deep inside a downstream service or database query.

### 2. Generics Without Tooling are Just Passive Comments
Writing `@template T` or `@param Collection<User>` without static analysis (PHPStan/Psalm) or runtime enforcement (TypePHP) is practically useless, as it turns DocBlocks into unverified wishful thinking that quickly rots as codebases evolve.

### 3. IDEs Have Limited Inference for Complex Generics
While modern IDEs (PhpStorm, VS Code) can autocomplete basic clases, their internal static indexers struggle or fail when dealing with **complex generic algebra**:
* Nested generics (e.g. `Collection<Producer<Dog>>`)
* Generics of refined scalars (e.g. `Collection<positive-int>`)
* Generics of array shapes (e.g. `Collection<array{id: int, status: string}>`)
* Generics with intersections (e.g. `Collection<Countable & ArrayAccess>`)
* Generic callables and higher-order mappers (e.g. `callable(V): V2`)
* Generic variance rules (`covariant` vs `contravariant`)

---

## The Solution: Non-Invasive Reification via TypePHP

Before TypePHP, the only way to get true runtime safety on third-party collections was the **Subclass Anti-Pattern**: creating dozens of boilerplate classes (`UserCollection extends ArrayCollection`, `ProductCollection extends ArrayCollection`) and manually writing repetitive `instanceof` assertions inside every method.

**TypePHP eliminates this boilerplate completely.** Using `\WeakMap` memory tracking and Load-Time Weaving, TypePHP turns any raw third-party collection into a **reified generic container at runtime** without touching a single line of vendor source code.

---

## Path Whitelisting in `typephp.php`

Because `vendor/**` is excluded by defult in TypePHP to protect application performance, you can whitelist specific third-party packages in your `typephp.php` configuration using **Pattern Specificity**.

### Adding Vendor Package Paths

Add the target vendor package paths to your `include` array in `typephp.php`:

```php
// typephp.php
return [
    'include' => [
        'src/**',
        'app/**',
        'vendor/doctrine/collections/**', // Whitelist Doctrine Collections
        'vendor/ramsey/collection/**',     // Whitelist Ramsey Collections
    ],

    'exclude' => [
        'vendor/**', // Excludes all other vendor packages
        'storage/**',
        'var/**',
    ],
];
```

> **Pattern Specificity:** Because `'vendor/doctrine/collections/**'` (length 32) is longer than `'vendor/**'` (length 8), TypePHP automatically prioritizes the whitelist rule and transforms only the requested package.

### Rebuilding the Cache

Pre-transform the whitelisted vendor files:

```bash
vendor/bin/typephp cache:rebuild
```

---

## Building Reusable TypePHP Extensions

If you manage multiple projects or author reusable packages, writing manual paths in `typephp.php` can become repetitive. 

TypePHP provides an **Extension System** (`ExtensionInterface`) that allows packages and shared integrations to automaticaly register path whitelists with **Include-Only Authority**.

### Implementing `ExtensionInterface`

Create an extension class implementing `TypePHP\Extension\ExtensionInterface`:

```php
<?php

declare(strict_types=1);

namespace App\TypePHP;

use TypePHP\Extension\ExtensionInterface;

class DoctrineCollectionsExtension implements ExtensionInterface
{
    /**
     * Returns configuration overrides provided by this extension.
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        return [
            'include' => [
                'vendor/doctrine/collections/**',
            ],
        ];
    }
}
```

> **Include-Only Safeguard:** For security and stability, TypePHP's `ExtensionManager` restricts extensons to appending `include` paths only. An extension can never blacklist application directories or alter global feature flags.

### Registering Extensions in `typephp.php`

Register your extension class in the `extensions` array:

```php
// typephp.php
return [
    'extensions' => [
        \App\TypePHP\DoctrineCollectionsExtension::class,
    ],

    'include' => [
        'src/**',
    ],

    'exclude' => [
        'vendor/**',
    ],
];
```

---

## Real-World Framework Integrations

TypePHP integrates transparently with modern web frameworks:

### Symfony Controller Integration

```php
namespace App\Controller;

use App\Entity\User;
use App\Entity\Product;
use Doctrine\Common\Collections\ArrayCollection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Routing\Attribute\Route;

class UserApiController extends AbstractController
{
    #[Route('/api/users', name: 'api_users')]
    public function index()
    {
        /** @var ArrayCollection<int, User> $users */
        $users = new ArrayCollection();

        $users->add(new User('Alice')); // Valid

        // TypePHP intercepts this at runtime and throws TypeError:
        $users->add(new Product('SKU-100')); 
        // Throws: TypeError: Argument $element (template T = App\Entity\User) must be of type User

        return $this->json($users->toArray());
    }
}
```

### Laravel Service Integration

```php
namespace App\Services;

use App\Models\User;
use App\Models\Product;
use Doctrine\Common\Collections\ArrayCollection;

class BillingService
{
    /**
     * @param ArrayCollection<string, User> $teamMembers
     */
    public function chargeTeam(ArrayCollection $teamMembers): int
    {
        return $teamMembers->count() * 50;
    }
}

// In your application:
$billing = new BillingService();

/** @var ArrayCollection<string, User> $team */
$team = new ArrayCollection();
$team->set('lead', new User('Alice')); // Valid

$billing->chargeTeam($team); // Returns 50

// Passing collection holding wrong type throws TypeError:
$badTeam = new ArrayCollection(['lead' => new Product('SKU-50')]);
$billing->chargeTeam($badTeam); // Throws TypeError!
```

---

## Running in Frameworks & Test Runners

Because TypePHP hooks into Composer's autoloader automatically, you can run your test suites or start your development servers with zero extra setup:

```bash
# Run in your test runner:
./vendor/bin/pest
./vendor/bin/phpunit

# Or start your web framework:
php artisan serve       # Laravel
symfony server:start    # Symfony
```

---

## Testing in Pest and PHPUnit

### Pest PHP Example

```php
use Doctrine\Common\Collections\ArrayCollection;
use TypePHP\Exception\TypeError;
use App\Models\User;
use App\Models\Product;

test('enforces generic type safety on Doctrine ArrayCollection', function () {
    /** @var ArrayCollection<int, User> $collection */
    $collection = new ArrayCollection();

    $collection->add(new User('Alice'));
    expect($collection->count())->toBe(1);

    expect(fn () => $collection->add(new Product('SKU-99')))
        ->toThrow(TypeError::class, 'must be of type App\Models\User');
});
```

### Standard PHPUnit Example

```php
namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use Doctrine\Common\Collections\ArrayCollection;
use TypePHP\Exception\TypeError;
use App\Models\User;
use App\Models\Product;

class CollectionTest extends TestCase
{
    public function testEnforcesGenericTypeSafety(): void
    {
        /** @var ArrayCollection<int, User> $collection */
        $collection = new ArrayCollection();

        $collection->add(new User('Alice'));
        $this->assertSame(1, $collection->count());

        $this->expectException(TypeError::class);
        $this->expectExceptionMessage('must be of type App\Models\User');

        $collection->add(new Product('SKU-99'));
    }
}
```

---

## Inspecting Bound Generic Types at Runtime

Because TypePHP implements **Reified Generics** via `\WeakMap`, you can inspect the bound generic parameters of any third-party collection instance at runtime:

```php
use TypePHP\TypePHP;

/** @var ArrayCollection<int, User> $users */
$users = new ArrayCollection();

// Inspect bound generic type
$itemType = TypePHP::getGenericType($users); 
// Returns: 'App\Models\User'

// Inspect all bound parameters (K and V)
$types = TypePHP::getGenericTypes($users); 
// Returns: ['TKey' => 'int', 'T' => 'App\Models\User']
```

---

## Summary Checklist

| Step | Purpose | Action |
| :--- | :--- | :--- |
| **1. Whitelist** | Tell TypePHP to transform the vendor package | Add `vendor/doctrine/collections/**` to `include` in `typephp.php` (or use an `ExtensionInterface`). |
| **2. Annotate** | Define the parameterized contract on the instance | Declare `/** @var ArrayCollection<int, User> */ $users = new ArrayCollection();`. |
| **3. Enforce** | Automatic runtime protection | TypePHP verifies all items inside `$collection->add()`, `set()`, and `get()` with zero boilerplate subclasses! |
