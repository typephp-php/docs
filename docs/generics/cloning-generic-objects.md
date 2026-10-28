# Cloning Generic Objects

Because TypePHP manages generic state using `\WeakMap` memory bound to specific object instances, cloning a generic object requires special architectural handling. 

When you clone a generic instance (`$cloned = clone $original`), TypePHP automatically intercepts the operation and copies all bound generic parameters (`T`) to the new cloned instance.

---

## Standard Cloning (`clone $obj`)

When you clone an object, the new instance immediately inherits the exact same generic state as the original instance:

<TypePHPSnippet title="Basic Generic Cloning" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class User {}
class Product {}

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

/** @var Collection<User> */
$users = new Collection();
$users->add(new User());

// Clone the generic collection
$clonedUsers = clone $users;

// The cloned collection safely retained T = User!
$clonedUsers->add(new User());
echo "✓ Cloned collection successfully accepted User\n\n";

// Adding a Product to the clone is blocked!
echo "Attempting to add Product to the cloned collection...\n";
$clonedUsers->add(new Product());
```

</TypePHPSnippet>

---

## Cloned Instance Memory Isolation

When an object is cloned, its generic bindings are copied *by value* to the new instance's `\WeakMap` entry. 

Because TypePHP keys the `\WeakMap` by object instance ID, **the original and cloned instances are 100% isolated in memory**. Modifying the generic state of the clone (e.g., using `@self-out` to transition a typestate) will **never** affect the original instance.

<TypePHPSnippet title="Cloned Instance Isolation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

class Dog {}
class Cat {}

/**
 * @template T
 */
class AnimalGroup
{
    /**
     * Dynamically widens the generic state of the instance!
     *
     * @template TNew
     * @param TNew $animal
     * @self-out self<T|TNew>
     */
    public function add(mixed $animal): void {}

    /**
     * @param T $animal
     */
    public function requireSame(mixed $animal): void {}
}

/** @var AnimalGroup<Dog> */
$group1 = new AnimalGroup();

// Clone Group 1 into Group 2
$group2 = clone $group1;

// Widen Group 2's generic state by adding a Cat!
$group2->add(new Cat());

echo "✓ Group 2 Type: " . TypePHP::getGenericType($group2) . "\n";
echo "✓ Group 1 Type: " . TypePHP::getGenericType($group1) . "\n\n";

// Group 2's T is now (Dog | Cat), so requireSame accepts Cat:
$group2->requireSame(new Cat()); 
echo "✓ Group 2 accepted Cat via requireSame()\n\n";

// Group 1 is completely isolated! Its T is still Dog, so it rejects Cat!
echo "Attempting to pass Cat into requireSame() on ORIGINAL Group 1...\n";
$group1->requireSame(new Cat());
```

</TypePHPSnippet>

---

## The `__clone()` Magic Method (Pre-Copying Guarantees)

If a generic class defines an explicit `__clone()` magic method, TypePHP guarantees that the generic template bindings are copied to the new object instance **before the `__clone()` method body executes**.

This ensures that any property assignments or method calls performed *inside* your `__clone()` implementation are fully protected by the generic state:

<TypePHPSnippet title="Magic __clone() Method Protection" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Dog {}
class Car {}

/**
 * @template T
 */
class SmartBox
{
    /** @var T|null */
    public mixed $item = null;

    /** @param T $item */
    public function set(mixed $item): void
    {
        $this->item = $item;
    }

    public function __clone(): void
    {
        // TypePHP pre-copied T = Dog before __clone() ran!
        // If we try to assign a Car here, TypePHP will block it instantly!
        $this->set(new Car()); 
    }
}

/** @var SmartBox<Dog> */
$box = new SmartBox();

echo "Cloning SmartBox...\n";
$clonedBox = clone $box; // Triggers __clone() and throws TypeError!
```

</TypePHPSnippet>

---

## PHP 8.5 `clone()` Property Replacement

PHP 8.5 introduces functional object cloning via the `clone($object, [...])` syntax, allowing developers to clone an object and override specific properties in a single expression.

TypePHP seamlessly intercepts this syntax using `RuntimeTypeChecker::cloneWith()`. It performs three critical operations atomically:
1. Copies the generic `\WeakMap` bindings from the original object to the new clone.
2. Intercepts the property overrides provided in the replacement array.
3. **Validates the overridden properties dynamically against their declared `@var` contracts** using the newly copied generic context.

<TypePHPSnippet title="PHP 8.5 clone() Property Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T
 */
class GenericRecord
{
    /**
     * @param positive-int $id
     * @param T $payload
     */
    public function __construct(
        public int $id,
        public mixed $payload
    ) {}
}

// Instantiate and bind T = string
/** @var GenericRecord<string> */
$record = new GenericRecord(10, 'Initial Payload');

// 1. Valid property replacement: Overriding payload with another string
$newRecord = clone($record, [
    'payload' => 'Updated Payload'
]);
echo "✓ Cloned successfully. New payload: {$newRecord->payload}\n\n";

// 2. Invalid property replacement: Overriding payload with an integer!
echo "Cloning with invalid integer payload override...\n";
$badRecord = clone($record, [
    'payload' => 999
]);
```

</TypePHPSnippet>

---

## Variance Enforcement on Cloned Assignments

When you assign a cloned generic instance to a variable with an inline `@var` annotation, TypePHP enforces generic variance rules during the assignment.

Because generics are **invariant** by default, assigning a cloned `GenericBox<Dog>` instance into a variable explicitly annotated as `GenericBox<Cat>` immediately throws an invariant type mismatch `TypeError`:

<TypePHPSnippet title="Variance Enforcement on Assignment" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Dog {}
class Cat {}

/**
 * @template T
 */
class GenericBox {}

/** @var GenericBox<Dog> $box1 */
$box1 = new GenericBox();

echo "✓ Created GenericBox<Dog>\n\n";

echo "Cloning and assigning to GenericBox<Cat>...\n";

// The clone is a GenericBox<Dog>. 
// Assigning it to a variable expecting GenericBox<Cat> violates invariance!
/** @var GenericBox<Cat> */
$box2 = clone $box1;
```
</TypePHPSnippet>