# Demystifying Variance

Generic variance controls how subtype relationships between underlying types affect the generic container. If `Dog` is a subclass of `Animal`, what is the relationship between `Producer<Dog>` and `Producer<Animal>`?

---

## The Core Question of Variance

* If **`Dog extends Animal`**, does **`Container<Dog>` extend `Container<Animal>`**?

The answer depends on whether the container is **reading data (Producer)**, **writing data (Consumer)**, or **both (Read-Write)**:

```
                            THE 3 MODES OF GENERIC VARIANCE

   1. Invariance (Default)       2. Covariance (Producer)       3. Contravariance (Consumer)
  ┌─────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐
  │   Exact Match ONLY      │   │   Subtypes Allowed (Dog)  │   │  Supertypes Allowed       │
  │   Read-Write Container  │   │   Read-Only Container     │   │  Write-Only Consumer      │
  └─────────────────────────┘   └───────────────────────────┘   └───────────────────────────┘
```

---

## 1. Invariance (Default / Read-Write Containers)

By default, generics in TypePHP (and PHPStan) are **invariant**. Invariance requires an **exact type match**.

```php
/** @template T */
class Box
{
    public function __construct(public mixed $item) {}
}

/**
 * @param Box<Animal> $box
 */
function checkBox(Box $box): void
{
    // ...
}

checkBox(new Box(new Animal())); // Valid
checkBox(new Box(new Dog()));    // Invalid in invariant mode!
// Throws: TypeError: Argument $box expects Box<invariant Animal>, but Box<Dog> was given
```

### Why Invariance is Mandatory for Read-Write Containers
If PHP allowed `Box<Dog>` to be passed into `checkBox(Box<Animal> $box)`:
```php
function checkBox(Box $box): void
{
    $box->item = new Cat(); // Valid for Box<Animal>, but corrupts Box<Dog>!
}
```
Putting a `Cat` into what the caller thought was a `Box<Dog>` would corrupt memory state! **Invariance completely prevents this bug.**

---

## 2. Covariance (`@template-covariant T` / Producer Mindset)

Covariance allows **subtypes** (`Dog` for `Animal`). Think of covariance as a **Producer / Read-Only** relationship.

If a function only *reads* from a container producing `Animal`s, passing a container producing `Dog`s is 100% safe because every `Dog` read out of the container is guaranteed to be an `Animal`!

```php
/**
 * @template-covariant T
 */
class Producer
{
    public function __construct(public mixed $item) {}
}

/**
 * Accepts Producer holding Animal or any subtype of Animal (Dog, Cat)
 *
 * @param Producer<Animal> $producer
 */
function handleProducer(Producer $producer): mixed
{
    return $producer->item;
}

// 1. Valid Call (Dog is a subtype of Animal)
handleProducer(new Producer(new Dog()));

// 2. Valid Call (Cat is a subtype of Animal)
handleProducer(new Producer(new Cat()));

// 3. Invalid Call (Car is not an Animal)
handleProducer(new Producer(new Car()));
// Throws: TypeError: handleProducer() expects Producer<covariant Animal>, but Producer<Car> was given
```

---

## 3. Contravariance (`@template-contravariant T` / Consumer Mindset)

Contravariance allows **supertypes** (`Animal` for `Dog`). Think of contravariance as a **Consumer / Write-Only** relationship.

If a function needs a handler that consumes a `Dog`, giving it a handler that can consume any general `Animal` is 100% safe because an `Animal` handler can process any `Dog` given to it!

```php
class Puppy extends Dog {}

/**
 * @template-contravariant T
 */
class Consumer
{
    /**
     * @param callable(T): void $handler
     */
    public function __construct(public mixed $handler) {}

    /**
     * @param T $item
     */
    public function consume(mixed $item): void
    {
        ($this->handler)($item);
    }
}

/**
 * Accepts Consumer designed for Dog or any supertype of Dog (Animal)
 *
 * @param Consumer<Dog> $consumer
 */
function processDogConsumer(Consumer $consumer, Dog $dog): void
{
    $consumer->consume($dog);
}

// 1. Valid: Animal handler can safely consume a Dog!
$animalHandler = fn (Animal $a) => null;
processDogConsumer(new Consumer($animalHandler), new Dog());

// 2. Invalid: Puppy handler cannot handle any general Dog!
$puppyHandler = fn (Puppy $p) => null;
processDogConsumer(new Consumer($puppyHandler), new Dog());
// Throws: TypeError: processDogConsumer() expects Consumer<contravariant Dog>, but Consumer<Puppy> was given
```

---

## Inline Usage-Site Variance Syntax

In addition to class-level declarations (`@template-covariant T` / `@template-contravariant T`), TypePHP supports declaring variance inline directly on function parameter and return type hints:

```php
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

---

## Variance Precedence Rules (Usage-Site Overrides)

What happens if an inline type hint specifies `Consumer<covariant Animal>`, but the class definition declared `@template-contravariant T`?

TypePHP resolves variance conflicts using **Usage-Site Precedence**:

1. **Usage-Site Override:** If a function parameter or return type explicitly specifies an inline variance modifier (`covariant` or `contravariant`), **the usage-site modifier takes precedence**.
2. **Class-Level Fallback:** If the call site uses standard syntax (`Consumer<Animal>`), TypePHP falls back to the class's declared `@template-covariant` or `@template-contravariant` rule.

```php
/**
 * Class declares Contravariant T (Default: Consumer / Supertypes)
 *
 * @template-contravariant T
 */
class Consumer
{
    public function __construct(public mixed $handler) {}
}

/**
 * Function parameter EXPLICITLY overrides with inline 'covariant Animal'
 *
 * @param Consumer<covariant Animal> $consumer
 */
function processCovariantConsumer(Consumer $consumer): mixed
{
    return $consumer->handler;
}

// 1. Valid Call (Dog is a subtype of Animal)
// Class declared contravariant, BUT function parameter explicitly specified 'covariant'.
// Usage-site 'covariant' wins!
processCovariantConsumer(new Consumer(new Dog()));

// 2. Invalid Call (Car is not an Animal)
processCovariantConsumer(new Consumer(new Car()));
// Throws: TypeError: processCovariantConsumer() expects Consumer<covariant Animal>, but Consumer<Car> was given
```

---

## Generic Return Invariance: Strict vs. Pragmatic Mode

A fundamental tension exists between how PHP's native type system operates and how static type checkers enforce generic containers.

### Native PHP LSP: All Return Types Are Naturally Covariant

Under the **Liskov Substitution Principle (LSP)** (formalized by Barbara Liskov & Jeannette Wing in 1994), method return types are inherently **covariant**: a subtype method may always return a narrower, more specific type (strengthening postconditions) than its parent.

In native PHP, full return type covariance was officially implemented in **PHP 7.4 (November 2019)** via the *"Covariant Returns and Contravariant Parameters"* RFC:

```php
class AnimalShelter {
    public function adopt(): Animal { ... }
}

class DogShelter extends AnimalShelter {
    // 100% valid native PHP 7.4+ (Covariant Return Type)
    public function adopt(): Dog { ... }
}
```

Because native PHP has embraced covariant returns since PHP 7.4, PHP developers and framework authors are naturally conditioned to expect that returning a subtype is always valid.

### The Clash: Static Generic Invariance vs. Developer Intuition

When developers move to generic containers, they intuitively expect the same covariant LSP behavior on returns:

```php
/**
 * @template T
 */
class Collection 
{
    public function add(mixed $item): void { ... }
}

/**
 * Promises to return a collection of Animals
 * 
 * @return Collection<Animal>
 */
function getAnimals(): Collection
{
    /** @var Collection<Dog> $dogs */
    $dogs = new Collection();
    $dogs->add(new Dog());

    return $dogs; 
}
```

In pure static type theory (and **PHPStan**, **Psalm**, **Mago**, etc.), returning `Collection<Dog>` when `Collection<Animal>` is promised is **strictly illegal**:
* A generic container is invariant by default.
* If a caller receives `Collection<Animal>`, the caller could attempt to write a `Cat` into it.
* Therefore, static analyzers demand that the author either marks the class with `@template-covariant T` or writes `@return Collection<covariant Animal>`.

**The reality of the PHP ecosystem**: In major frameworks and libraries (such as Laravel, Shopware, and Symfony), collection classes are rarely annotated with `@template-covariant`, and developers regularly omit `<covariant ...>` from their return DocBlocks. The code was written under PHP's natural mental model that *returns are covariant*.

---

### The Solution: `'strict_return_generic_invariance'` Toggle

TypePHP bridges the gap between pure static analysis theory and the reality of the PHP ecosystem through a configurable switch in `typephp.php`:

```php
// typephp.php
return [
    /*
    |--------------------------------------------------------------------------
    | Strict Generic Return Invariance (PHPStan / Psalm Parity)
    |--------------------------------------------------------------------------
    | - true  (Default / Strict): Requires an exact invariant match or explicit
    |         covariance annotations (@template-covariant / <covariant T>).
    | - false (Pragmatic Mode): Aligns with PHP's native return covariance (LSP),
    |         allowing subtypes on return types without explicit docblock tags.
    */
    'strict_return_generic_invariance' => true,
];
```

---

### Why Pragmatic Mode is 100% Runtime-Safe in TypePHP

Static analysis tools (like PHPStan) must enforce strict return invariance because they cannot track an object in memory after it leaves the function boundary. They fear a "write corruption" bug might happen later in the code.

**TypePHP eliminates this risk entirely at runtime using reified generics (`\WeakMap`).**

Even if pragmatic mode is enabled (`'strict_return_generic_invariance' => false`), allowing `Collection<Dog>` to be returned under a `@return Collection<Animal>` contract, **the underlying object never forgets its true type**:

```php
// With 'strict_return_generic_invariance' => false:

/**
 * @return Collection<Animal>
 */
function getAnimals(): Collection
{
    /** @var Collection<Dog> $dogs */
    $dogs = new Collection();
    $dogs->add(new Dog());

    return $dogs; // Allowed: matches native PHP's covariant return intuition
}

$animals = getAnimals();

// A caller tries to corrupt the collection by adding a Cat:
$animals->add(new Cat());

// TYPEPHP INSTANTLY PREVENTS MEMORY CORRUPTION AT RUNTIME:
// TypeError: Argument $item (template T = Dog) must be of type Dog, Cat given
```

Even though the return contract allowed the collection to exit under the broader `Collection<Animal>` boundary, **TypePHP's runtime memory state preserved the exact constraint `T = Dog`**. The moment an incompatible type is pushed into that collection anywhere down the line, TypePHP catches it immediately.

---

## Freedom from Variance Bans: Write & Read Methods in TypePHP

In compiled languages (like C# or Kotlin) and static analyzers (like PHPStan, Psalm, and Mago), generic classes are subjected to rigid, theoretical declaration bans:

* **Static Analyzers Completely Ban Input Parameters on Covariant Classes:**  
  If a class declares `@template-covariant T`, static analyzers throw a fatal error if `T` appears in *any* method parameter, claiming it is an illegal "contravariant position."
* **Static Analyzers Completely Ban Return Types on Contravariant Classes:**  
  If a class declares `@template-contravariant T`, static analyzers throw a fatal error if `T` appears in *any* return type, claiming it is an illegal "covariant position."

### Why Developers Actually Need These Methods (The Hybrid Reality)

Real-world PHP code is rarely 100% purely a "producer" or 100% purely a "consumer." Real classes are **hybrids**:

#### Example 1: Covariant Inspection Methods (`contains()` and `indexOf()`)
A developer writes a read-only collection and marks it `@template-covariant T` because it only produces data. But then they add a simple inspection method:

```php
/**
 * @template-covariant T
 */
class ReadOnlyCollection
{
    /** @var array<int, T> */
    private array $elements = [];

    /**
     * Purely read-only! But static analyzers BAN this because $item is an input parameter:
     *
     * @param T $item
     */
    public function contains(mixed $item): bool
    {
        return in_array($item, $this->elements, true);
    }

    /**
     * @param T $item
     */
    public function indexOf(mixed $item): int|false
    {
        return array_search($item, $this->elements, true);
    }
}
```
* **To the developer:** This is 100% read-only. Nothing is written to memory. It simply checks if an item exists.
* **To PHPStan / Psalm / Mago:** **BANNED.** Because `$item` is in a parameter position, the static analyzer throws a fatal error and refuses to pass the class definition, forcing developers into awkward workarounds (like abandoning covariance or using untyped `mixed`) or just ignore the static analysis error outright.

#### Example 2: Contravariant Inspection & Peeking Methods (`getFallback()` and `peek()`)
A developer writes an event consumer or message bus and marks it `@template-contravariant T`. But they need helper methods to inspect the default event or peek at the last handled message:

```php
/**
 * @template-contravariant T
 */
class EventProcessor
{
    private mixed $lastHandled = null;

    public function __construct(private mixed $fallbackEvent) {}

    /** @param T $event */
    public function process(mixed $event): void
    {
        $this->lastHandled = $event;
    }

    /**
     * Pure inspection! But static analyzers BAN this because T is returned:
     *
     * @return T
     */
    public function getFallback(): mixed
    {
        return $this->fallbackEvent;
    }

    /**
     * @return ?T
     */
    public function peekLast(): mixed
    {
        return $this->lastHandled;
    }
}
```
* **To the developer:** This is an essential helper to inspect defaults or diagnose processing pipelines.
* **To PHPStan / Psalm / Mago:** **BANNED.** Because `T` is in a return position, static analyzers reject the class outright.

---

### TypePHP's Runtime Immunity: Write & Read Without Fear

**TypePHP does not ban write methods on covariant classes or read methods on contravariant classes.** You are completely free to write natural, ergonomic methods on your generic classes.

Why? Because static analyzers ban these methods out of **fear of untracked runtime corruption**, but **TypePHP tracks real memory via `\WeakMap` and makes corruption impossible.**

#### Scenario A: Covariant Write Method Immunity
Suppose you define a covariant container with an `addItem` write method:

```php
/**
 * @template-covariant T
 */
class Container 
{
    private array $items = [];

    /** @param T $item */
    public function addItem(mixed $item): void
    {
        $this->items[] = $item;
    }

    /** @return T[] */
    public function getItems(): array
    {
        return $this->items;
    }
}
```

Now, suppose a function accepts `Container<Animal>` (allowed via covariance) and attempts a contravariant mutation:

```php
/** @param Container<Animal> $container */
function sneakCatIntoAnimalContainer(Container $container): void
{
    // The function assumes $container can take ANY Animal, so it tries to write a Cat!
    $container->addItem(new Cat());
}

/** @var Container<Dog> $dogContainer */
$dogContainer = new Container();
$dogContainer->addItem(new Dog());

// Passing $dogContainer to Container<Animal> succeeds via covariance:
sneakCatIntoAnimalContainer($dogContainer);
```

#### What Happens at Runtime in TypePHP?

1. **`\WeakMap` Never Dilutes Identity:** Even though `sneakCatIntoAnimalContainer` labeled the parameter `Container<Animal>`, TypePHP’s `\WeakMap` kept `$dogContainer` pinned strictly to `T = Dog`.
2. **The Mutation is Halted Dead in its Tracks:** The moment `$container->addItem(new Cat())` is called, TypePHP inspects `$this` in `\WeakMap`, confirms `T = Dog`, and **halts execution immediately with a `TypeError`**:
   ```text
   TypePHP\Exception\TypeError: Container::addItem(): Argument $item (template T = Dog) 
   must be of type Dog, Cat given
   ```
3. **Zero Memory Corruption:** The `Cat` is never added to `$items`. The container remains in a 100% valid state.
4. **Passing a Generic `Animal` is Also Blocked:** Even if the function tries `$container->addItem(new Animal())`, TypePHP blocks it because a base `Animal` is not a `Dog`.

#### Scenario B: Contravariant Read Method Immunity
Similarly, if a contravariant class (`@template-contravariant T`) exposes a read or peeking method (`public function get(): T`):
* If `Consumer<Animal>` is passed to a function expecting `Consumer<Dog>` (valid via contravariance), and the function calls `$consumer->get()` expecting a `Dog` to emerge:
* The moment `get()` returns a plain `Animal` or `Cat`, TypePHP’s `ReturnChecker` intercepts the return value and throws:
  ```text
  TypeError: Consumer::get(): Return value must be of type Dog, Animal returned
  ```
* The caller is physically prevented from ever receiving contaminated data.

---

### The Paradigm Shift: Static Paralyzation vs. Runtime Protection

| Feature | Static Analyzers (PHPStan / Psalm / Mago) | TypePHP (Runtime Type Checker) |
| :--- | :--- | :--- |
| **Inspection Methods on Covariant Classes** (`contains(T)`, `indexOf(T)`) | **Banned.** Rejects the class definition. |  **Fully permitted.** Non-mutating lookups run naturally. |
| **Write Methods on Covariant Classes** (`addItem(T)`) | **Banned.** Rejects the class definition. |  **Fully permitted.** Protected at invocation time by `\WeakMap`. |
| **Read / Peeking Methods on Contravariant Classes** (`get(): T`, `peek(): T`) | **Banned.** Rejects the class definition. |  **Fully permitted.** Protected at invocation time by `ReturnChecker`. |
| **Why?** | Blind at runtime. Must ban syntax to avoid hypothetical bugs. | Reifies generics in `\WeakMap`. Guards the actual instance in real memory. |
| **Developer Experience** | Forces code mutilation and awkward workarounds. | Write natural, idiomatic, hybrid PHP classes with total runtime immunity. |

---

## Summary Matrix

| Variance Mode | Keyword / Syntax | Allowed Types | Mental Model |
| :--- | :--- | :--- | :--- |
| **Invariant** (Default) | `Collection<T>` | **Exact type only** | **Read-Write:** Prevents container corruption. |
| **Covariant** | `@template-covariant T`<br>`Box<covariant Animal>` | **Subtypes** (`Dog`, `Cat`) | **Producer:** Safe for reading data out. Matches native PHP return LSP. Input methods (`add(T)`, `contains(T)`) are fully protected by `\WeakMap`. |
| **Contravariant** | `@template-contravariant T`<br>`Consumer<contravariant Dog>` | **Supertypes** (`Animal`) | **Consumer:** Safe for writing data in. Matches native PHP parameter LSP. Output methods (`get(): T`, `peek(): T`) are fully protected by `ReturnChecker`. |
| **Pragmatic Return Mode** | `'strict_return_generic_invariance' => false` | **Subtypes on returns** | **Framework Friendly:** Adopts native return covariance while `\WeakMap` continues guarding writes. |
