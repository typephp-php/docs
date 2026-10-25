# Generic Variance

Generic variance controls how subtype relationships between underlying types affect the generic container. If `Dog` is a subclass of `Animal`, what is the relationship between a `Producer<Dog>` and a `Producer<Animal>`?

The answer depends on whether the container is **reading data (Producer)**, **writing data (Consumer)**, or **both (Read-Write)**:

```text
                            THE 3 MODES OF GENERIC VARIANCE

   1. Invariance (Default)       2. Covariance (Producer)       3. Contravariance (Consumer)
  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
  │   Exact Match ONLY      │   │   Subtypes Allowed (Dog)  │   │  Supertypes Allowed       │
  │   Read-Write Container  │   │   Read-Only Container     │   │  Write-Only Consumer      │
  └─────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
```

---

## Invariance (Default / Read-Write Containers)

By default, generics in TypePHP (and static analyzers) are **invariant**. Invariance requires an **exact type match**.

### Why Invariance is Mandatory for Read-Write Containers

If PHP allowed a `Box<Dog>` to be passed into a function expecting a `Box<Animal>`, the function might try to push a `Cat` into what the caller thought was a box of Dogs! Invariance completely prevents this memory corruption.

<TypePHPSnippet title="Invariance (Default)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}

/** @template T */
class Box
{
    /** @param T $item */
    public function __construct(public mixed $item) {}
}

/**
 * @param Box<Animal> $box
 */
function checkBox(Box $box): void
{
    echo "✓ Box verified as Box<Animal>\n";
}

// 1. Valid Call: Exact match
checkBox(new Box(new Animal()));

// 2. Invalid Call: Dog is a subtype of Animal, but Box is INVARIANT!
echo "\nPassing Box<Dog> into Box<Animal> expectation...\n";
checkBox(new Box(new Dog()));
```

</TypePHPSnippet>

---

## Covariance (`@template-covariant T` / Producer Mindset)

Covariance allows **subtypes** (e.g. accepting `Dog` where `Animal` is expected). Think of covariance as a **Producer** or **Read-Only** relationship.

If a function only *reads* from a container producing `Animal`s, passing a container producing `Dog`s is 100% safe because every `Dog` read out of the container is guaranteed to be a valid `Animal`!

<TypePHPSnippet title="Covariance (@template-covariant)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}
class Car {}

/**
 * @template-covariant T
 */
class Producer
{
    /** @param T $item */
    public function __construct(public mixed $item) {}
}

/**
 * Accepts Producer holding Animal or any subtype of Animal (Dog, Cat)
 *
 * @param Producer<Animal> $producer
 */
function handleProducer(Producer $producer): void
{
    echo "✓ Producer valid holding: " . get_class($producer->item) . "\n";
}

// 1. Valid: Dog is a subtype of Animal
handleProducer(new Producer(new Dog()));

// 2. Valid: Cat is a subtype of Animal
handleProducer(new Producer(new Cat()));

// 3. Invalid: Car is not an Animal!
echo "\nAttempting to pass Producer<Car>...\n";
handleProducer(new Producer(new Car()));
```

</TypePHPSnippet>

---

## Contravariance (`@template-contravariant T` / Consumer Mindset)

Contravariance allows **supertypes** (e.g. accepting `Animal` where `Dog` is expected). Think of contravariance as a **Consumer** or **Write-Only** relationship.

If a function needs a handler that consumes a `Dog`, giving it a handler that can consume *any* general `Animal` is 100% safe because an `Animal` handler is perfectly capable of processing any `Dog` you give it!

<TypePHPSnippet title="Contravariance (@template-contravariant)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Puppy extends Dog {}

/**
 * @template-contravariant T
 */
class Consumer
{
    /** @param callable(T): void $handler */
    public function __construct(public mixed $handler) {}
}

/**
 * Accepts Consumer designed for Dog or any SUPERTYPE of Dog (Animal)
 *
 * @param Consumer<Dog> $consumer
 */
function processDogConsumer(Consumer $consumer): void
{
    echo "✓ Consumer valid!\n";
}

// 1. Valid: Animal handler can safely consume a Dog!
$animalHandler = fn (Animal $a) => null;
processDogConsumer(new Consumer($animalHandler));

// 2. Invalid: Puppy handler cannot handle any general Dog!
echo "\nAttempting to pass Consumer<Puppy> into Consumer<Dog> expectation...\n";
$puppyHandler = fn (Puppy $p) => null;
processDogConsumer(new Consumer($puppyHandler));
```

</TypePHPSnippet>

---

## Inline Usage-Site Variance Syntax (`<covariant T>`)

In addition to class-level declarations, TypePHP supports declaring variance inline directly on function parameter and return type hints:

```php:line-numbers
/**
 * @param Repository<covariant Animal> $repo
 * @param Consumer<contravariant Dog> $consumer
 * @return Producer<covariant Animal>
 */
function processContracts(Repository $repo, Consumer $consumer): Producer
{
    // ...
}
```

### Variance Precedence Rules (Usage-Site Overrides)

What happens if an inline type hint specifies `Consumer<covariant Animal>`, but the class definition declared `@template-contravariant T`?

**Usage-site modifiers always take precedence:**
1. If a parameter explicitly specifies `<covariant Animal>`, that overrides the class definition for that specific call.
2. If the parameter uses standard syntax `<Animal>`, TypePHP falls back to the class's declared `@template-*` rule.

<TypePHPSnippet title="Usage-Site Variance Override" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Car {}

/**
 * Class declares Contravariant T (Default: Consumer / Supertypes)
 *
 * @template-contravariant T
 */
class Consumer
{
    /** @param T $handler */
    public function __construct(public mixed $handler) {}
}

/**
 * Function parameter EXPLICITLY overrides with inline 'covariant Animal'
 *
 * @param Consumer<covariant Animal> $consumer
 */
function processCovariantConsumer(Consumer $consumer): void
{
    echo "✓ Consumer processed successfully!\n";
}

// 1. Valid Call: Dog is a subtype of Animal.
// The class is declared contravariant, BUT the function parameter explicitly 
// specified 'covariant'. Usage-site 'covariant' wins!
processCovariantConsumer(new Consumer(new Dog()));

// 2. Invalid Call: Car is not an Animal!
echo "\nAttempting to pass Consumer<Car>...\n";
processCovariantConsumer(new Consumer(new Car()));
```

</TypePHPSnippet>

---

## Generic Return Invariance: Strict vs. Pragmatic Mode

A fundamental tension exists between how PHP's native type system operates and how static type checkers enforce generic containers.

### Native PHP LSP: All Returns Are Covariant
Under the Liskov Substitution Principle (LSP), method return types are inherently **covariant**. A subtype method may always return a narrower, more specific type than its parent. This is 100% valid in native PHP 7.4+:

```php:line-numbers
class AnimalShelter {
    public function adopt(): Animal { ... }
}

class DogShelter extends AnimalShelter {
    // Valid Native PHP Covariant Return
    public function adopt(): Dog { ... }
}
```

Because native PHP returns are covariant, framework developers intuitively assume that returning a specialized subtype collection (`Collection<Dog>`) from a method promising `Collection<Animal>` is completely valid.

### The Static Analyzer Clash
Static analyzers (PHPStan, Psalm) ban this by default. They treat generic containers as invariant. They demand that you either mark the class as `@template-covariant T` or write `@return Collection<covariant Animal>`. 

### The Solution: Pragmatic Return Mode
TypePHP bridges the gap between pure static theory and the reality of PHP frameworks through a configurable switch in `typephp.php`:

```php:line-numbers
// typephp.php
return [
    /*
    | - true  (Default / Strict): Requires exact invariant match or explicit <covariant T>.
    | - false (Pragmatic Mode): Aligns with native PHP LSP covariance, allowing 
    |         subtypes on return types without explicit docblock tags.
    */
    'strict_return_generic_invariance' => false,
];
```

### Why Pragmatic Mode is 100% Runtime-Safe in TypePHP
Static analyzers ban covariant returns because they are blind at runtime and fear memory corruption later in the script. **TypePHP eliminates this risk entirely using `\WeakMap`.**

Even if pragmatic mode allows a `Collection<Dog>` to be returned under a `Collection<Animal>` contract, the underlying object never forgets its true type. If a caller later tries to corrupt the collection by adding a `Cat`, TypePHP instantly halts execution.

---

## Freedom from Variance Bans (Read & Write Methods)

In compiled languages and static analyzers, generic classes are subjected to rigid, theoretical bans:
- **Static Analyzers Ban Input Parameters on Covariant Classes:** If a class is `@template-covariant T`, static analyzers throw a fatal error if `T` appears in *any* method parameter (claiming it's a "contravariant position").
- **Static Analyzers Ban Return Types on Contravariant Classes:** If a class is `@template-contravariant T`, they ban `T` in *any* return type.

### The Reality of Hybrid Classes
Real-world classes are rarely 100% purely "producers." You might have a read-only, covariant collection, but you need a harmless inspection method:

```php:line-numbers
/** @template-covariant T */
class ReadOnlyCollection
{
    /**
     * Purely read-only! But static analyzers BAN this because $item is an input parameter:
     *
     * @param T $item
     */
    public function contains(mixed $item): bool
    {
        return in_array($item, $this->items, true);
    }
}
```
Static analyzers force you to degrade your types (use `mixed`) or split your classes into messy fragments just to satisfy their linters.

### TypePHP's Runtime Immunity
**TypePHP does not ban write methods on covariant classes or read methods on contravariant classes.** You are completely free to write natural, ergonomic methods.

Because TypePHP tracks real memory via `\WeakMap`, it doesn't need to ban syntax out of fear. It guards the actual instance in real time:

<TypePHPSnippet title="Freedom from Variance Bans" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}

/**
 * @template-covariant T
 */
class CovariantContainer 
{
    private array $items = [];

    /** 
     * Write methods are fully permitted in TypePHP!
     * 
     * @param T $item 
     */
    public function addItem(mixed $item): void
    {
        $this->items[] = $item;
    }
}

/** 
 * Accepts CovariantContainer holding Animal or any subtype (like Dog)
 *
 * @param CovariantContainer<Animal> $container 
 */
function sneakCatIntoAnimalContainer(CovariantContainer $container): void
{
    echo "Attempting to push Cat into covariant container...\n";
    // The function assumes $container can take ANY Animal, so it tries to write a Cat!
    $container->addItem(new Cat());
}

/** @var CovariantContainer<Dog> $dogContainer */
$dogContainer = new CovariantContainer();

// TypePHP's WeakMap keeps $dogContainer pinned strictly to T = Dog!
// The mutation is halted dead in its tracks:
sneakCatIntoAnimalContainer($dogContainer);
```

</TypePHPSnippet>
