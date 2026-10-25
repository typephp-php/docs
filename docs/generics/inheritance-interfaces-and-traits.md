# Inheritance, Interfaces & Traits

TypePHP resolves and inherits generic contracts across parent classes, interfaces, and traits, ensuring subtype implementations strictly adhere to parameterized type contracts at runtime with zero duplicated DocBlocks.

---

## Tooling Template Priority Hierarchy

When resolving template tags, TypePHP uses a strict 3-tier priority hierarchy while preserving the exact positional declaration order of your template parameters:

| Priority Tier | Scope | Supported Tag Variants |
| :--- | :--- | :--- |
| **Tier 1** *(Highest)* | **PHPStan** | `@phpstan-template`, `@phpstan-template-covariant`, `@phpstan-template-contravariant` |
| **Tier 2** | **Psalm** | `@psalm-template`, `@psalm-template-covariant`, `@psalm-template-contravariant` |
| **Tier 3** *(Base)* | **Standard** | `@template`, `@template-covariant`, `@template-contravariant` |

### Why Priority & Tag Merging Matter for Templates

In real-world libraries, authors frequently:
1. Write a broad `@template T` for basic IDE autocomplete, and refine it with `@phpstan-template T of Animal` for strict static analysis.
2. Split upper bounds and variance modifiers across separate tags for the same template parameter (e.g., `@phpstan-template T of Animal` alongside `@phpstan-template-covariant T`).
3. Mix variance modifiers across multiple template parameters (e.g., `@template-covariant K of array-key` followed by `@template V`).

TypePHP resolves the highest-priority tooling tag, **merges split bounds, defaults, and variance modifiers** for the same template name, and **preserves the exact declaration order** of template parameters (`K`, then `V`):

<TypePHPSnippet title="Tooling Template Priority Resolution" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Car {}

/**
 * Standard tag has no bound, but @phpstan-template enforces Animal bound
 * and @phpstan-template-covariant marks T as covariant:
 *
 * @template T
 * @phpstan-template T of Animal
 * @phpstan-template-covariant T
 */
class BoundedProducer
{
    /**
     * @param T $item
     */
    public function __construct(public mixed $item) {}
}

// 1. Valid: Dog extends Animal
$producer = new BoundedProducer(new Dog());
echo "✓ Instantiated BoundedProducer with Dog\n\n";

// 2. Invalid: Car does not extend Animal
// TypePHP merges @phpstan-template T of Animal with @phpstan-template-covariant T and blocks the Car!
echo "Attempting to instantiate with Car...\n";
new BoundedProducer(new Car());
```

</TypePHPSnippet>

---

## Inherited Template Annotations

When extending generic parent classes, implementing generic interfaces, or using generic traits, TypePHP treats all of the following variations as 100% equivalent:

| Inheritance Context | Supported Tag Variations |
| :--- | :--- |
| **Class Inheritance** | `@extends`, `@template-extends`, `@phpstan-extends`, `@psalm-extends` |
| **Interface Implementation** | `@implements`, `@template-implements`, `@phpstan-implements`, `@psalm-implements` |
| **Trait Usage** | `@use`, `@template-use`, `@phpstan-use` |

---

## Interface Implementation (`@implements` / `@template-implements`)

When a class implements a generic interface, declare the concrete template binding via `@implements` or `@template-implements`. The implementing class automatically inherits the interface's method parameter and return contracts:

<TypePHPSnippet title="Generic Interface Implementation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Cat {}
class Dog {}

/**
 * Generic Interface
 *
 * @template T
 */
interface ProcessorInterface
{
    /**
     * @param T $item
     * @return T
     */
    public function process(mixed $item): mixed;
}

/**
 * Fulfills T = Cat via @template-implements
 *
 * @template-implements ProcessorInterface<Cat>
 */
class CatProcessor implements ProcessorInterface
{
    // No DocBlock needed on method! Inherits T = Cat from interface contract.
    public function process(mixed $item): mixed
    {
        return $item;
    }
}

$processor = new CatProcessor();

// 1. Valid Call
$processor->process(new Cat());
echo "✓ Processed Cat successfully\n\n";

// 2. Invalid Call: Dog is not a Cat!
echo "Attempting to pass Dog into CatProcessor...\n";
$processor->process(new Dog());
```

</TypePHPSnippet>

---

## Class Extension (`@extends` / `@template-extends`)

When a child class extends a generic parent class (e.g., `@extends BaseRepository<User>`), TypePHP resolves and inherits the parent's generic template bindings across the entire class hierarchy:

<TypePHPSnippet title="Generic Class Extension" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class User { public function __construct(public string $name) {} }
class Product { public function __construct(public string $sku) {} }

/**
 * @template T
 */
abstract class BaseRepository
{
    /**
     * @param T $entity
     */
    public function save(mixed $entity): void
    {
        echo "✓ Saved entity: " . get_class($entity) . "\n";
    }
}

/**
 * Fulfills T = User via @template-extends
 *
 * @template-extends BaseRepository<User>
 */
class UserRepository extends BaseRepository
{
}

$userRepo = new UserRepository();

// 1. Valid Save
$userRepo->save(new User('Alice'));
echo "\n";

// 2. Invalid Save: Product is not a User!
// The child class inherited T = User for the save() method parameter!
echo "Attempting to save Product in UserRepository...\n";
$userRepo->save(new Product('SKU-100'));
```

</TypePHPSnippet>

---

## Generic Traits (`@use` / `@template-use` / `@phpstan-use`)

TypePHP supports binding generic template parameters to traits. You can declare the binding either at the **class level** or **directly above the inline `use Trait;` statement**:

<TypePHPSnippet title="Generic Traits" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Dog {}
class Car {}

/**
 * @template T
 */
trait ItemLoggerTrait
{
    /**
     * @param T $item
     */
    public function logItem(mixed $item): void
    {
        echo "✓ Logged item: " . get_class($item) . "\n";
    }
}

/**
 * Option A: Class-level docblock binds T = Dog for the trait
 *
 * @use ItemLoggerTrait<Dog>
 */
class ClassLevelLogService
{
    use ItemLoggerTrait;
}

class InlineLogService
{
    /**
     * Option B: Inline statement docblock binds T = Dog
     *
     * @use ItemLoggerTrait<Dog>
     */
    use ItemLoggerTrait;
}

$serviceA = new ClassLevelLogService();
$serviceA->logItem(new Dog()); // Valid

$serviceB = new InlineLogService();
$serviceB->logItem(new Dog()); // Valid

echo "\nAttempting to pass Car into trait bound to Dog...\n";
$serviceB->logItem(new Car());
```

</TypePHPSnippet>

---

## Vendor DocBlock Isolation for Inherited Generics

Third-party vendor libraries sometimes contain loose, outdated, or buggy DocBlock annotations. If your application extends a third-party vendor class or uses a vendor trait, TypePHP protects your application via **Vendor Isolation**:

* If an ancestor class or trait is located inside an `exclude` directory (such as `/vendor/`), TypePHP **ignores its inherited DocBlocks**.
* If your application class (in `src/`, included) defines `/** @use VendorTrait<Dog> */` or `/** @extends VendorRepository<User> */`, TypePHP **binds and enforces your application contract**, while keeping vendor internals safely protected from strict analysis crashes.
