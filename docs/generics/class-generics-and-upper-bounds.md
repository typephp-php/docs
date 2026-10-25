# Class Generics & Upper Bounds

Class generics parameterize classes and interfaces, transforming standard PHP classes into reusable, strongly-typed containers that enforce contracts directly in memory throughout an object's entire lifecycle.

---

## What Are Reified Generics vs. Erased Generics?

To understand why TypePHP is different from other languages, it helps to understand **Type Erasure**:

- **Type Erasure (Java, TypeScript, Python, Static Analyzers):** Generic type parameters like `<User>` are erased during compilation. At runtime, the container becomes an untyped `Object` or raw array. The running program has zero memory of what types the container was created to hold.
- **Reified Generics (C#, TypePHP):** Generic type parameters are preserved in live memory. The object instance itself knows its bound type (`T = User`), enabling active runtime boundary enforcement and live runtime introspection.

### The Untyped Boundary Problem (Why Erasure Fails)

In modern PHP applications, objects routinely pass through untyped or third-party boundaries: framework middleware pipelines, queue handlers, event dispatchers, or legacy helpers:

```php:line-numbers
function processCollection(Collection $collection): void
{
    // In an erased type system, the generic parameter is gone!
    // A caller could accidentally push an incompatible Product here,
    // and neither PHP nor an erased system could prevent memory corruption.
}
```

**TypePHP eliminates this blind spot completely.** Because generic bindings are attached to the object instance in `\WeakMap` memory, the object **never forgets its type**, even when passing through untyped boundaries:

<TypePHPSnippet title="Reified Generics Across Untyped Boundaries" default-view="source">

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

/**
 * An untyped helper function (simulating a framework pipeline or middleware)
 * Notice: No generic DocBlock here! Native PHP only sees "Collection $c".
 */
function untypedFrameworkPipeline(Collection $c): void
{
    echo "1. Object crossed untyped boundary without losing generic identity\n";
    echo "   Reified memory type inside pipeline: " . TypePHP::getGenericType($c) . "\n\n";

    echo "2. Attempting to pollute untyped collection with Product...\n";
    // Even though this function has no generic annotations,
    // the collection instance remembers T = User in memory!
    $c->add(new Product('SKU-100'));
}

/** @var Collection<User> $users */
$users = new Collection();
$users->add(new User('Alice'));

untypedFrameworkPipeline($users);
```

</TypePHPSnippet>

---

## The Reified Introspection API

Because TypePHP preserves generic parameters in memory, you can inspect an object's bound generic types and declared variances at runtime using TypePHP's public static methods:

### Method Signatures

```php:line-numbers
namespace TypePHP;

final class TypePHP
{
    /**
     * Returns the bound generic type for a template on an object instance.
     * If no template name is specified on a single-template class, returns the type automatically.
     */
    public static function getGenericType(object $instance, ?string $templateName = null): ?string;

    /**
     * Returns all bound generic template parameters for an object instance as a key-value array.
     * 
     * @return array<string, string>
     */
    public static function getGenericTypes(object $instance): array;

    /**
     * Returns the declared variance ('covariant', 'contravariant', or 'invariant') for a template.
     */
    public static function getGenericVariance(object $instance, ?string $templateName = null): string;

    /**
     * Returns all declared template variances for an object instance.
     * 
     * @return array<string, string>
     */
    public static function getGenericVariances(object $instance): array;
}
```

### Interactive Introspection Example

<TypePHPSnippet title="Runtime Generic Introspection API" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

class User {}
class Product {}

/**
 * @template T
 */
class SingleBag
{
    public function __construct(public mixed $item) {}
}

/**
 * @template-covariant K of array-key
 * @template V
 */
class KeyValueCatalog
{
    public function __construct(public mixed $k, public mixed $v) {}
}

/** @var SingleBag<User> $bag */
$bag = new SingleBag(new User());

/** @var KeyValueCatalog<string, Product> $catalog */
$catalog = new KeyValueCatalog('prod_01', new Product());

// 1. Single-Template Smart Fallback (No template name required!)
echo "Single Bag Type: " . TypePHP::getGenericType($bag) . "\n\n";

// 2. Multi-Template Explicit Key Lookup
echo "Catalog Key Type:   " . TypePHP::getGenericType($catalog, 'K') . "\n";
echo "Catalog Value Type: " . TypePHP::getGenericType($catalog, 'V') . "\n\n";

// 3. Inspect All Bound Templates as Array
echo "Catalog Full Bindings:\n";
print_r(TypePHP::getGenericTypes($catalog));

// 4. Inspect Declared Variance
echo "Catalog K Variance: " . TypePHP::getGenericVariance($catalog, 'K') . "\n";
echo "Catalog V Variance: " . TypePHP::getGenericVariance($catalog, 'V') . "\n";
```

</TypePHPSnippet>

---

## How TypePHP Manages Memory via `\WeakMap`

TypePHP manages generic state using PHP's native `\WeakMap`:

- **Weak References:** In `\WeakMap`, the object instances serve as keys.
- **Automatic Garbage Collection:** The exact microsecond an object instance is unset or goes out of scope, PHP's garbage collector automatically deletes its generic bindings from RAM with **zero memory leaks**.
- **Zero Subclass Explosion:** TypePHP never modifies class prototypes or generates dynamic subclasses.

---

## Deep Enforcement vs. Boundary Enforcement

It is crucial to understand **when and where** TypePHP intercepts a generic type violation. This depends on whether the generic class itself is **included** or **excluded** in your `typephp.php` configuration.

### Included Classes (Deep Enforcement)

If you want TypePHP to throw an error the exact moment an internal method is invoked (e.g. `$collection->add(new Product())`), **the generic class must be whitelisted in your `typephp.php` `include` array.**

When a class is included, TypePHP weaves guard rails directly into its internal methods and constructors:

```php:line-numbers
// In typephp.php:
// 'include' => ['app/Collections/MyCollection.php']

/** @var MyCollection<User> $users */
$users = new MyCollection();

// Throws TypeError IMMEDIATELY inside MyCollection::add():
// "Argument $item (template T = User) must be of type User, Product given"
$users->add(new Product()); 
```

### Excluded Classes (Boundary Enforcement)

Most third-party generic containers (like Laravel's `Illuminate\Support\Collection` or Doctrine's `ArrayCollection`) live in `vendor/**`, which is excluded by default for maximum framework performance.

When a generic class is excluded, TypePHP **does not intercept its internal methods or constructors**. Instead, it tracks the object's generic "badge" in memory and strictly enforces the contract **at the application boundary** when the container crosses into an included function or service method:

```php:line-numbers
// 1. Framework collection is excluded in vendor/
// 'exclude' => ['vendor/**']

// 2. Label the collection in your application code:
/** @var Illuminate\Support\Collection<string> $strings */
$strings = new Collection(['valid_string', 12345]); // No error thrown yet!

// 3. Application service acts as a strict boundary gatekeeper:
class NumberService 
{
    /** @param Collection<int> $numbers */
    public function process(Collection $numbers): void {}
}

$service = new NumberService();

// Throws TypeError at the service boundary!
// "Argument $numbers expects Collection<covariant int>, but Collection<string> was given"
$service->process($strings); 
```

::: tip Choosing Deep vs. Boundary Enforcement
- **Exclude third-party vendor classes (`vendor/**`):** Keeps framework internals executing at 100% native C-speed while TypePHP defends your application services against incompatible containers.
- **Include application classes (`app/**`, `src/**`):** Provides immediate deep validation inside every internal method and constructor.
:::

---

## Generic Template Upper Bounds (`@template T of Bound`)

Use `@template T of Bound` to restrict template arguments to a specific class hierarchy, interface, or scalar type.

TypePHP actively validates template upper bounds **directly at the moment of object instantiation and assignment via inline `@var` annotations**:

<TypePHPSnippet title="Generic Template Upper Bounds" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal 
{
    public function __construct(public string $name) {}
}

class Dog extends Animal {}
class Cat extends Animal {}
class Car {} // Not an Animal!

/**
 * @template T of Animal
 */
class Shelter
{
    /** @var array<int, T> */
    public array $animals = [];

    /**
     * @param T $animal
     */
    public function admit(Animal $animal): void
    {
        $this->animals[] = $animal;
        echo "✓ Admitted {$animal->name} (" . get_class($animal) . ")\n";
    }
}

// 1. Valid: Dog satisfies upper bound Animal
/** @var Shelter<Dog> $dogShelter */
$dogShelter = new Shelter();
$dogShelter->admit(new Dog('Buddy'));

// 2. Valid: Cat satisfies upper bound Animal
/** @var Shelter<Cat> $catShelter */
$catShelter = new Shelter();
$catShelter->admit(new Cat('Luna'));

// 3. Invalid: Car violates upper bound Animal at assignment!
echo "\nAttempting to instantiate Shelter<Car>...\n";
/** @var Shelter<Car> $carShelter */
$carShelter = new Shelter();
```

</TypePHPSnippet>

---

## Scalar & Array Shape Upper Bounds on Classes

Generic parameters (`T`) are not limited to object classes. You can bind class templates to refined scalars (`positive-int`, `non-empty-string`) or complex array shapes (`array{id: positive-int}`):

<TypePHPSnippet title="Scalar & Shape Upper Bounds" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T of positive-int
 */
class ScoreTracker
{
    /** @var array<int, T> */
    public array $scores = [];

    /** @param T $score */
    public function record(int $score): void
    {
        $this->scores[] = $score;
        echo "✓ Recorded score: {$score}\n";
    }
}

// 1. Valid instantiation
/** @var ScoreTracker<positive-int> $tracker */
$tracker = new ScoreTracker();
$tracker->record(100);

// 2. Invalid assignment: string violates upper bound positive-int!
echo "\nAttempting to instantiate ScoreTracker<string>...\n";
/** @var ScoreTracker<string> $badTracker */
$badTracker = new ScoreTracker();
```

</TypePHPSnippet>

---

## Default Generic Templates (`@template T = DefaultType`)

If a class template is unannotated, TypePHP falls back to the declared default type:

```php:line-numbers
/**
 * @template T = string
 */
class StorageBox
{
    /** @param T $item */
    public function store(mixed $item): void { ... }
}

$box = new StorageBox(); // Unbound T falls back to default: string
$box->store('valid');    // Valid
$box->store(12345);      // Throws TypeError: Argument $item must be of type string
```

---

## First-Use Type Inference on Instances

If you instantiate an **included** generic class without an inline `@var` prebinding annotation:

```php:line-numbers
$collection = new Collection(); // No @var Collection<User> annotation!
```

TypePHP automatically infers the template parameter `T` from the **very first method call** executed on that object instance and locks `T` to that type in `\WeakMap` memory for all subsequent calls:

<TypePHPSnippet title="First-Use Generic Type Inference" default-view="source">

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
    /** @param T $item */
    public function add(mixed $item): void {}
}

// Unannotated instance
$collection = new Collection();
echo "Initial Type before first use: " . (TypePHP::getGenericType($collection) ?? 'null (unbound)') . "\n";

// 1. First method call infers T = User and locks T in WeakMap memory!
$collection->add(new User('Alice'));
echo "Type locked after first add(): " . TypePHP::getGenericType($collection) . "\n\n";

// 2. Subsequent call with User succeeds
$collection->add(new User('Bob'));
echo "✓ Added second user successfully\n\n";

// 3. Subsequent call with Product fails because T was locked to User on first use!
echo "Attempting to add Product to instance locked to User...\n";
$collection->add(new Product('SKU-100'));
```

</TypePHPSnippet>

---

## Simultaneous Multi-Template First-Use Inference

For multi-template classes (like `Dictionary<K, V>`), the very first method call simultaneously infers and locks **all active template parameters**:

<TypePHPSnippet title="Simultaneous Multi-Template Inference" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

/**
 * @template K of array-key
 * @template V
 */
class Dictionary
{
    private array $items = [];

    /**
     * @param K $key
     * @param V $val
     */
    public function set(int|string $key, mixed $val): void
    {
        $this->items[$key] = $val;
    }
}

$dict = new Dictionary();

// 1. First method call infers K = string and V = int simultaneously:
$dict->set('timeout', 30);

$types = TypePHP::getGenericTypes($dict);
echo "✓ Locked Types: K = {$types['K']}, V = {$types['V']}\n\n";

// 2. Subsequent call matching K = string and V = int succeeds:
$dict->set('retries', 5);

// 3. Call violating locked K = string fails:
echo "Attempting to pass integer key into string-keyed dictionary...\n";
$dict->set(100, 30);
```

</TypePHPSnippet>