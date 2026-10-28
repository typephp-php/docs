# Advanced Generic Patterns

TypePHP supports advanced type-theoretic generic patterns, including **F-Bounded Polymorphism** (recursive self-referential bounds), **Existential Wildcard Placeholders (`<*>`)**, **Typestate Transitions (`@self-out`)**, and **Conditional Generic Contracts**.

---

## F-Bounded Polymorphism (`@template T of Comparable<T>`)

F-Bounded polymorphism occurs when a generic template's upper bound refers directly to the template parameter itself:

```php:line-numbers
/**
 * @template T of Comparable<T>
 */
interface Comparable
{
    /** @param T $other */
    public function compareTo(mixed $other): int;
}
```

In standard, naive type-checkers, verifying whether a concrete class (e.g. `User implements Comparable<User>`) satisfies `@template T of Comparable<T>` triggers an **infinite recursion loop**:
1. To check `User`, inspect its bound: `Comparable<User>`.
2. To check `Comparable<User>`, inspect `User`'s bound: `Comparable<User>`.
3. To check `Comparable<User>`, inspect `User`'s bound... $\rightarrow$ `Fatal Error: Maximum function nesting level reached`.

### How TypePHP Solves F-Bounds (Cycle-Detection Stack)

In `TemplateManager::checkIdentifierAgainstGenericVariance()`, TypePHP tracks in-flight generic evaluations in an in-memory cycle detection stack (`$varianceCycleStack`):

```php:line-numbers
$cycleKey = $existing->name . '@' . (string) $expected;
if (isset(self::$varianceCycleStack[$cycleKey])) {
    return true; // Coinductive cycle detected -> Safely terminate recursion!
}
self::$varianceCycleStack[$cycleKey] = true;
```

By recognizing coinductive recursive cycles, TypePHP allows self-referencing generic contracts to execute safely with **zero call-stack overflows**:

<TypePHPSnippet title="F-Bounded Polymorphism with Comparable<T>" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * F-Bounded Interface: T is bounded by an interface parameterized by T itself!
 *
 * @template T of Comparable<T>
 */
interface Comparable
{
    /** @param T $other */
    public function compareTo(mixed $other): int;
}

/**
 * @implements Comparable<UserScore>
 */
class UserScore implements Comparable
{
    public function __construct(public int $score) {}

    public function compareTo(mixed $other): int
    {
        return $this->score <=> $other->score;
    }
}

class NonComparableUser {}

/**
 * Function enforcing F-Bounded template constraint
 *
 * @template T of Comparable<T>
 * @param T $a
 * @param T $b
 * @return T
 */
function findMaximum(Comparable $a, Comparable $b): Comparable
{
    return $a->compareTo($b) >= 0 ? $a : $b;
}

// 1. Valid Call: UserScore satisfies F-bound Comparable<UserScore>
$u1 = new UserScore(150);
$u2 = new UserScore(300);

$max = findMaximum($u1, $u2);
echo "✓ Maximum Score: {$max->score}\n\n";

// 2. Invalid Call: NonComparableUser does not implement Comparable<T>
echo "Attempting to pass non-comparable class into F-bounded function...\n";
findMaximum(new NonComparableUser(), new NonComparableUser());
```

</TypePHPSnippet>

---

## Wildcard Generic Arguments (`<*>`)

When a function accepts a generic container but **does not care about the specific type parameter**, or when working with **circular / mutually recursive generic interfaces**, use the asterisk wildcard placeholder (`<*>`):

```php:line-numbers
/**
 * Accepts any Collection regardless of what type parameter it holds
 *
 * @param Collection<*> $collection
 */
function inspectCollection(Collection $collection): int
{
    return $collection->count();
}
```

### Breaking Circular & Self-Referential Dependencies

Enterprise architectures often define circular generic contracts—for example, an `Entity` that knows its `EntityId`, while the `EntityId` knows its `Entity`. In standard invariant systems, this causes recursive deadlocks. 

Wildcards (`<*>`) act as an **existential boundary** that breaks circular recursion cleanly:

<TypePHPSnippet title="Solving Circular Generics with Wildcards" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template TId of CircularIdInterface<*>
 */
interface CircularEntityInterface {}

/**
 * @template TEntity of CircularEntityInterface<*>
 */
interface CircularIdInterface {}

class Order implements CircularEntityInterface {}

/**
 * @implements CircularIdInterface<Order>
 */
class OrderId implements CircularIdInterface {}

/**
 * Accepts any ID implementing the circular generic contract
 *
 * @param CircularIdInterface<*> $id
 */
function verifyIdentifier(CircularIdInterface $id): void
{
    echo "✓ Verified circular ID: " . get_class($id) . "\n";
}

verifyIdentifier(new OrderId()); // Valid! Zero recursion deadlocks.
```

</TypePHPSnippet>

### Partial Multi-Template Wildcards (`Dictionary<string, *>`)

For multi-template classes (like `Dictionary<K, V>`), you can lock one template parameter while leaving the other as an open wildcard:

<TypePHPSnippet title="Partial Multi-Template Wildcards" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template K of array-key
 * @template V of object
 */
class Dictionary
{
    public array $items = [];

    /**
     * @param K $key
     * @param V $val
     */
    public function put(mixed $key, mixed $val): void 
    { 
        $this->items[$key] = $val; 
    }
}

class User {}
class Product {}

/**
 * Strictly requires string keys, but accepts ANY object value!
 *
 * @param Dictionary<string, *> $dict
 */
function processStringDictionary(Dictionary $dict): void
{
    echo "✓ Verified string dictionary with " . count($dict->items) . " item(s)\n";
}

// 1. Valid: String keys with User values
/** @var Dictionary<string, User> */
$userDict = new Dictionary();
$userDict->put('user_1', new User());
processStringDictionary($userDict);

// 2. Valid: String keys with Product values
/** @var Dictionary<string, Product> */
$prodDict = new Dictionary();
$prodDict->put('prod_1', new Product());
processStringDictionary($prodDict);

// 3. Invalid: Integer keys violate Dictionary<string, *>!
echo "\nPassing integer-keyed dictionary into string-keyed wildcard expectation...\n";
/** @var Dictionary<int, User> */
$intDict = new Dictionary();
$intDict->put(1, new User());
processStringDictionary($intDict);
```

</TypePHPSnippet>

### Wildcards (`<*>`) vs. Top-Type (`<mixed>`)

While both `<*>` and `<mixed>` accept any generic instance at runtime, **`<*>` is the idiomatic standard**:
- **Upper Bound Compliance:** If a class declares `@template T of Animal`, strict static analysis flags `Shelter<mixed>` because `mixed` is broader than `Animal`. `Shelter<*>` automatically adopts the class's declared upper bound (`? extends Animal`).
- **Circular Generic Resolution:** For self-referencing interfaces (`Entity<Id<*>>`), `<*>` is the formal placeholder that prevents infinite recursion loops.

---

## Generic State Transitions & Typestates (`@self-out` & `@this-out`)

Normally, an object's generic parameters are locked upon instantiation. 

**Typestates** (`@self-out`, `@this-out`, `@phpstan-self-out`, `@psalm-self-out`) allow a method to **re-type the generic state of the existing object instance in `\WeakMap` memory upon method completion**. This enables runtime verification of finite state machines (FSMs), progressive fluent builders, and dynamic generic union accumulation.

### In-Place Finite State Machines (FSMs)

Model operational workflows (such as authentication or payment gateways) where methods are only callable when the object is in an authorized generic state:

<TypePHPSnippet title="State Machines with Typestates (@self-out)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

/**
 * @template TState of 'unauthenticated'|'authenticated'
 */
class Session
{
    /**
     * @self-out self<'authenticated'>
     */
    public function login(): void {}

    /**
     * @self-out self<'unauthenticated'>
     */
    public function logout(): void {}
}

/**
 * @param Session<'authenticated'> $session
 */
function viewSecretDashboard(Session $session): void
{
    echo "✓ Access GRANTED to secret dashboard!\n";
}

/** @var Session<'unauthenticated'> */
$session = new Session();
echo "Initial State: " . TypePHP::getGenericType($session) . "\n";

// 1. Transition state to 'authenticated'
$session->login();
echo "State after login(): " . TypePHP::getGenericType($session) . "\n";

// 2. Permitted: Session is authenticated
viewSecretDashboard($session);

// 3. Logout transitions state back to 'unauthenticated'
$session->logout();
echo "State after logout(): " . TypePHP::getGenericType($session) . "\n\n";

// 4. Calling dashboard with logged-out session triggers TypeError!
echo "Attempting to access dashboard with logged-out session...\n";
viewSecretDashboard($session);
```

</TypePHPSnippet>

### Dynamic Union Accumulation (`self<T|TNew>`)

Mutable collection classes can use `@self-out` to accumulate and widen generic union types dynamically as items of different types are pushed into the container:

<TypePHPSnippet title="Dynamic Generic Union Accumulation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

class Dog {}
class Cat {}

/**
 * @template T
 */
class MutableCollection
{
    /** @var array<int, T> */
    public array $items = [];

    /**
     * Accumulates new type TNew into the instance's generic template T in WeakMap!
     *
     * @template TNew
     * @param TNew $item
     * @self-out self<T|TNew>
     */
    public function push(mixed $item): void
    {
        $this->items[] = $item;
    }
}

/** @var MutableCollection<Dog> */
$col = new MutableCollection();
echo "Initial Type: " . TypePHP::getGenericType($col) . "\n";

// Pushing a Cat dynamically widens the instance's binding to (Dog | Cat)!
$col->push(new Cat());

echo "Type after pushing Cat: " . TypePHP::getGenericType($col) . "\n";
```

</TypePHPSnippet>

### Progressive Fluent Builders (`@this-out`)

Enforce that mandatory configuration steps must be executed before a builder can be consumed:

<TypePHPSnippet title="Progressive Fluent Builders (@this-out)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template TStep of 'init'|'configured'|'ready'
 */
class QueryBuilder
{
    /**
     * @this-out self<'configured'>
     */
    public function setTable(string $table): self
    {
        return $this;
    }

    /**
     * @this-out self<'ready'>
     */
    public function prepare(): self
    {
        return $this;
    }
}

/**
 * Requires builder to have completed BOTH setTable() and prepare()
 *
 * @param QueryBuilder<'ready'> $builder
 */
function executeQuery(QueryBuilder $builder): void
{
    echo "✓ Query executed successfully\n";
}

$builder = new QueryBuilder();

// 1. Valid fully prepared chain
executeQuery($builder->setTable('users')->prepare());

// 2. Incomplete chain: setTable() was called, but prepare() was skipped!
echo "\nPassing incomplete builder into executor...\n";
$incompleteBuilder = (new QueryBuilder())->setTable('orders');
executeQuery($incompleteBuilder);
```

</TypePHPSnippet>

---

## Conditional Generic Types (`T is Target ? A : B`)

Conditional types allow you to evaluate type contracts dynamically based on an inferred template `T`.

### Conditional Parameters

Enforce that the expected type of an argument depends on the inferred generic type of another argument:

<TypePHPSnippet title="Conditional Parameters with Generics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}

/**
 * If T is Dog, $output must be list<Dog>; otherwise Cat
 *
 * @template T of Animal
 * @param T $animal
 * @param (T is Dog ? list<T> : T) $output
 */
function handleAnimalOutput(Animal $animal, mixed $output): void
{
    echo "✓ Handled " . get_class($animal) . " output cleanly\n";
}

$dog = new Dog();
$cat = new Cat();

// 1. T = Dog -> $output must be list<Dog>
handleAnimalOutput($dog, [$dog, new Dog()]);

// 2. T = Cat -> $output must be Cat
handleAnimalOutput($cat, $cat);

// 3. Passing single Dog when list<Dog> was expected fails!
echo "\nPassing single Dog when list<Dog> is required...\n";
handleAnimalOutput($dog, $dog);
```

</TypePHPSnippet>

### Conditional Return Types

```php:line-numbers
/**
 * @template T
 * @param T $input
 * @param mixed $output
 * @return (T is Dog ? positive-int : non-empty-string)
 */
function evaluateAnimalResult(mixed $input, mixed $output): mixed
{
    return $output;
}

evaluateAnimalResult(new Dog(), 42);           // Return must be positive-int
evaluateAnimalResult(new Cat(), 'valid_text'); // Return must be non-empty-string
```

---

## Generics with Unions & Intersections

TypePHP fully supports combining generic structures with Union (`|`) and Intersection (`&`) types, both as item constraints and as **upper bounds**.

### Unions and Intersections as Template Upper Bounds

Constrain template `T` to members of a union or to objects satisfying multiple interfaces simultaneously:

<TypePHPSnippet title="Unions & Intersections as Template Bounds" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Dog {}
class Cat {}
class Car {}

/**
 * Union Upper Bound: T must be Dog or Cat
 *
 * @template T of Dog|Cat
 * @param T $pet
 */
function groomPet(object $pet): void
{
    echo "✓ Groomed " . get_class($pet) . "\n";
}

groomPet(new Dog()); // Valid
groomPet(new Cat()); // Valid

echo "\nPassing Car into bounded pet function...\n";
groomPet(new Car()); // Throws TypeError: Car does not satisfy upper bound (Dog | Cat)
```

</TypePHPSnippet>

### Generic Containers Holding Intersections (`Collection<Countable & ArrayAccess>`)

Enforce that generic items inside a container must implement multiple interfaces:

```php:line-numbers
/**
 *  @var Collection<Countable & ArrayAccess> 
 */
$collections = new Collection();

$collections->add(new ArrayObject([1, 2])); // Valid (Implements both)

$collections->add(new CountableOnly());      // Throws TypeError: Fails ArrayAccess
```
