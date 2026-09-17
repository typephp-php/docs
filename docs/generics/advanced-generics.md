# Advanced Types & Callables

TypePHP allows combining generic templates (`T`, `K`, `V`) with high-level type algebra, including Higher-Order Callables, Lazy Iterables, Generators, Conditionals, Unions, Intersections, Typestates, Wildcard Placeholders, Instantiation Guards, and Deeply Nested Containers.

---

## Generic Callables with Template Substitution

When a function accepts a generic callback (`@param callable(T): T $transformer`), TypePHP dynamically substitutes `T` with the inferred concrete type before callback invocation:

```php
/**
 * Generic transformer function
 *
 * @template T
 *
 * @param callable(T): T $transformer
 * @param T $input
 *
 * @return T
 */
function transformValue(callable $transformer, mixed $input): mixed
{
    return $transformer($input);
}

// 1. Valid Call: Infers T = int, validates callback argument (int) and return (int)
$double = fn (int $x): int => $x * 2;
transformValue($double, 21); // Returns 42

// 2. Invalid Callback Return: T is inferred as int (from 10), but callback returns string ('invalid')
$badReturn = fn (int $x): string => 'invalid';
transformValue($badReturn, 10);
// Throws: TypeError: transformValue(): Return value must be of type int, string 'invalid' returned
```

---

## Higher-Order Generic Transformers (`array<K, V>` & `callable(V): V2`)

TypePHP pre-infers template parameters across multiple arguments simultaneously:

```php
/**
 * Higher-order array mapper with 3 generic parameters
 *
 * @template K of array-key
 * @template V
 * @template V2
 *
 * @param callable(V): V2 $callback
 * @param array<K, V> $array
 *
 * @return array<K, V2>
 */
function mapArray(callable $callback, array $array): array
{
    $result = [];
    foreach ($array as $key => $value) {
        $result[$key] = $callback($value);
    }

    return $result;
}

$stringify = fn (int $n): string => "val_{$n}";

// 1. Valid Call: Infers K = string, V = int, V2 = string
$res = mapArray($stringify, ['a' => 10, 'b' => 20]);
// Returns: ['a' => 'val_10', 'b' => 'val_20']

// 2. Invalid Call: 'invalid_string' violates inferred V = int on function entry!
mapArray($stringify, ['item1' => 10, 'item2' => 'invalid_string']);
// Throws: TypeError: mapArray(): Argument $array['item2'] must be of type int, string 'invalid_string' given
```

---

## Generic Iterables & Generators (`iterable<T>` & `Generator<K, V>`)

TypePHP substitutes template parameters into iterators, validating yielded items, keys, and generator inputs (`$gen->send()`) lazily during execution:

```php
/**
 * @template T
 *
 * @param iterable<T> $stream
 * @param T $sample
 *
 * @return list<T>
 */
function collectStream(iterable $stream, mixed $sample): array
{
    $collected = [];
    foreach ($stream as $item) {
        $collected[] = $item;
    }
    return $collected;
}

// Infers T = int from $sample (1)
$iterator = new ArrayIterator([10, 'invalid', 30]);
collectStream($iterator, 1);
// Throws: TypeError: Iterator $stream value must be of type int, string 'invalid' given
```

### Generic Interactive Generators (`Generator<int, T, T, void>` / `TSend`)

When `TSend` uses a generic template `T`, `$gen->send()` is dynamically validated against the bound generic type:

```php
/**
 * @template T
 *
 * @param T $initial
 *
 * @return Generator<int, T, T, void>
 */
function streamInteractive(mixed $initial): Generator
{
    $current = $initial;
    for ($i = 0; $i < 3; $i++) {
        $input = yield $i => $current;
        if ($input !== null) {
            $current = $input;
        }
    }
}

// Initial value 10 locks T = int
$gen = streamInteractive(10);
$gen->current();

$gen->send(20); // Valid (20 is int)

$gen->send('invalid'); // Invalid: string violates T = int!
// Throws: TypeError: streamInteractive(): Generator sent value (TSend) must be of type int, string 'invalid' given
```

---

## Conditional Types with Generics (`(T is Target ? A : B)`)

TypePHP dynamically evaluates conditional contracts based on inferred generic templates. This applies to **both Return Types and Parameters**.

### Conditional Parameters

You can enforce that one parameter's contract depends on the inferred runtime generic type `T` of another parameter:

```php
/**
 * @template T of Animal
 *
 * @param T $animal
 * @param (T is Dog ? list<T> : T) $output
 */
function processAnimal(Animal $animal, mixed $output): void
{
    // ...
}

$dog = new Dog();
$cat = new Cat();

// T is inferred as Dog -> $output parameter contract evaluates to list<Dog>
processAnimal($dog, [$dog, new Dog()]); // Valid

processAnimal($dog, clone $dog); 
// Throws: TypeError: processAnimal(): Argument $output must be a list, TypePHP\Tests\Fixtures\Domain\Dog given

// T is inferred as Cat -> $output parameter contract evaluates to Cat
processAnimal($cat, clone $cat); // Valid
```

### Conditional Return Types

```php
/**
 * @template T
 *
 * @param T $input
 * @param mixed $output
 *
 * @return (T is Dog ? positive-int : non-empty-string)
 */
function processInput(mixed $input, mixed $output): mixed
{
    return $output;
}

// 1. T is inferred as Dog -> Evaluates return contract as positive-int
processInput(new Dog(), 100); // Valid

// 2. T is inferred as Cat -> Evaluates return contract as non-empty-string
processInput(new Cat(), 'valid_string'); // Valid

processInput(new Cat(), ''); // Invalid: empty string violates non-empty-string
// Throws: TypeError: processInput(): Return value must be of type non-empty-string, empty string ('') returned
```

### Negated Generic Conditionals (`(T is not Target ? A : B)`)

Negated conditions (`is not`) are also fully supported for both parameters and return types:

```php
/**
 * @template T
 *
 * @param T $input
 * @param mixed $result
 *
 * @return (T is not Dog ? non-empty-string : positive-int)
 */
function processNegated(mixed $input, mixed $result): mixed
{
    return $result;
}

processNegated(new Cat(), 'valid_text'); // Valid (Cat is not Dog -> non-empty-string)
processNegated(new Dog(), 42);           // Valid (Dog is Dog -> positive-int)
```

---

## Generic State Transitions & Typestates (`@self-out` & `@this-out`)

TypePHP supports **Typestates** via `@self-out` (and its aliases `@this-out`, `@phpstan-self-out`, `@psalm-self-out`). 

Normally, an object's generic type is locked upon instantiation. `@self-out` allows a method to **re-type the generic state of the existing object instance in memory (`\WeakMap`) upon method completion**, enabling verifiable finite state machines (FSMs), progressive fluent builders, and dynamic generic accumulation.

### 1. In-Place Finite State Machines (FSMs)

Model strict operational workflows (like authentication, payment processing, or order fulfillment) where methods are only callable when the object is in a specific generic state:

```php
/**
 * @template TState of 'unauthenticated'|'authenticated'
 */
class Session
{
    /**
     * Transitions session state to 'authenticated'
     *
     * @self-out self<'authenticated'>
     */
    public function login(): void
    {
        // Internal authentication logic...
    }

    /**
     * Transitions session state back to 'unauthenticated'
     *
     * @self-out self<'unauthenticated'>
     */
    public function logout(): void
    {
        // Internal cleanup logic...
    }
}

/**
 * Function strictly demanding an authenticated session
 *
 * @param Session<'authenticated'> $session
 */
function accessSecureDashboard(Session $session): void
{
    // Access granted...
}

// 1. Initial State: 'unauthenticated'
/** @var Session<'unauthenticated'> $session */
$session = new Session();

accessSecureDashboard($session);
// Throws: TypeError: accessSecureDashboard(): Argument $session expects Session<invariant 'authenticated'>, but Session<'unauthenticated'> was given

// 2. Perform state transition
$session->login();

// 3. The exact same instance is now re-typed to 'authenticated' in memory!
accessSecureDashboard($session); // Valid!

// 4. Logout transitions the state back
$session->logout();
accessSecureDashboard($session);
// Throws: TypeError: accessSecureDashboard(): Argument $session expects Session<invariant 'authenticated'>, but Session<'unauthenticated'> was given
```

### 2. Dynamic Template Accumulation (`self<T|TNew>`)

Mutable collection classes can use `@self-out` to accumulate and widen generic union types dynamically as items of different types are added:

```php
/**
 * @template T
 */
class MutableCollection
{
    /** @var array<int, T> */
    public array $items = [];

    /**
     * Accumulates new type TNew into the instance's generic template T
     *
     * @template TNew
     *
     * @param TNew $item
     *
     * @self-out self<T|TNew>
     */
    public function push(mixed $item): void
    {
        $this->items[] = $item;
    }
}

/** @var MutableCollection<Dog> $col */
$col = new MutableCollection();
TypePHP::getGenericType($col); // Returns: "App\Models\Dog"

// Pushing a Cat widens the instance's generic binding to (Dog | Cat)
$col->push(new Cat());

TypePHP::getGenericType($col); // Returns: "(App\Models\Dog | App\Models\Cat)"
```

### 3. Conditional State Transitions

You can branch generic state mutations based on method arguments:

```php
/**
 * @template TRole of 'guest'|'admin'
 */
class UserAccount
{
    /**
     * @param bool $asAdmin
     *
     * @self-out ($asAdmin is true ? self<'admin'> : self<'guest'>)
     */
    public function switchRole(bool $asAdmin): void
    {
        // Role switching logic...
    }
}

/** @var UserAccount<'guest'> $account */
$account = new UserAccount();

// 1. Conditional transition to 'admin'
$account->switchRole(asAdmin: true);
TypePHP::getGenericType($account); // Returns: "'admin'"

// 2. Conditional transition back to 'guest'
$account->switchRole(asAdmin: false);
TypePHP::getGenericType($account); // Returns: "'guest'"
```

### 4. Progressive Fluent Builders (`@this-out`)

Enforce that mandatory setup steps must be executed before a builder can be consumed:

```php
/**
 * @template TStep of 'init'|'configured'|'ready'
 */
class QueryBuilder
{
    /**
     * @this-out self<'configured'>
     */
    public function configure(string $table): self
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
 * Requires builder to have completed both configure() and prepare()
 *
 * @param QueryBuilder<'ready'> $builder
 */
function executeQuery(QueryBuilder $builder): void
{
    // ...
}

$builder = new QueryBuilder();

// Incomplete chain
executeQuery($builder->configure('users'));
// Throws: TypeError: executeQuery(): Argument $builder expects QueryBuilder<invariant 'ready'>, but QueryBuilder<'configured'> was given

// Fully prepared chain
executeQuery($builder->configure('users')->prepare()); // Valid!
```

### 5. Runtime Inspection API

You can inspect the current generic state of any `@self-out` instance at runtime using TypePHP's facade:

```php
$type = TypePHP::getGenericType($instance);
```

---

## Generic Template Upper Bound Enforcement on Instantiation & Assignment

TypePHP actively validates template upper bounds (`@template T of UpperBound`) **directly at the moment of object assignment and instantiation via inline `@var` annotations**.

An object instance cannot be annotated with an invalid generic type argument without TypePHP intercepting it and halting execution:

```php
class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}
class Car {}

/**
 * @template T of Animal
 */
class Shelter
{
    public function __construct(public Animal $resident) {}
}

// 1. Valid Assignment: Dog satisfies the upper bound 'Animal'
/** @var Shelter<Dog> $validShelter */
$validShelter = new Shelter(new Dog()); // Valid!

// 2. Invalid Assignment: Car violates the upper bound 'Animal'
/** @var Shelter<Car> $badShelter */
$badShelter = new Shelter(new Dog());
// Throws: TypeError: Variable $badShelter: Generic type argument Car does not satisfy upper bound Animal of template T in Shelter

// 3. Invalid Assignment: Shelter is not an Animal!
/** @var Shelter<Shelter> $nestedBadShelter */
$nestedBadShelter = new Shelter(new Dog());
// Throws: TypeError: Variable $nestedBadShelter: Generic type argument Shelter does not satisfy upper bound Animal of template T in Shelter
```

### Scalar & Refinement Upper Bounds on Generic Classes

This enforcement applies equally to scalar upper bounds, int ranges, and string refinements:

```php
/**
 * @template T of positive-int
 */
class PositiveScoreBox
{
    public function __construct(public int $score) {}
}

/** @var PositiveScoreBox<string> $badBox */
$badBox = new PositiveScoreBox(10);
// Throws: TypeError: Variable $badBox: Generic type argument string does not satisfy upper bound positive-int of template T in PositiveScoreBox
```

---

## Wildcard Generic Arguments (`<*>`)

When a function accepts a generic container but **does not care about the specific generic type parameter**, or when working with **circular / self-referential generic interfaces**, you can use the asterisk wildcard placeholder (`<*>`):

```php
/**
 * Accepts any Collection regardless of what type it holds
 *
 * @param Collection<*> $collection
 */
function inspectCollection(Collection $collection): int
{
    return $collection->count();
}
```

### 1. Single-Template Wildcards (`Interface<*>`)

A wildcard matches **any concrete type that satisfies the template's declared upper bound**:

```php
interface EntityIdInterface {}

class OrderId implements EntityIdInterface {}
class UserId implements EntityIdInterface {}

/**
 * Accepts any Repository whose generic argument implements EntityIdInterface
 *
 * @param Repository<EntityIdInterface<*>> $repo
 */
function auditRepository(Repository $repo): void
{
    // ...
}

auditRepository(new Repository(new OrderId())); // Valid
auditRepository(new Repository(new UserId()));  // Valid
auditRepository(new Repository(new stdClass())); // Throws: TypeError (Does not satisfy bound)
```

### 2. Solving Circular & Self-Referential Generics

Frameworks often define self-referencing generic contracts (e.g., an Entity whose ID knows its Entity, and an ID whose Entity knows its ID). In standard invariant generics, this causes an infinite recursive type-checking loop.

Wildcards (`<*>`) act as an existential boundary that breaks the recursion cleanly:

```php
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
function processId(CircularIdInterface $id): void
{
    // TypePHP verifies the contract without entering an infinite recursion loop!
}

processId(new OrderId()); // Valid!
```

### 3. Partial Multi-Template Wildcards (`Dictionary<string, *>`)

For multi-template classes (like `Dictionary<K, V>`), you can lock one template while leaving the other as a wildcard:

```php
/**
 * @template K of array-key
 * @template V of object
 */
class Dictionary
{
    public array $items = [];
    public function put(mixed $key, mixed $val): void { $this->items[$key] = $val; }
}

/**
 * Strictly requires string keys, but accepts ANY object value!
 *
 * @param Dictionary<string, *> $dict
 */
function processStringDictionary(Dictionary $dict): int
{
    return count($dict->items);
}

/** @var Dictionary<string, User> $userDict */
$userDict = new Dictionary();
processStringDictionary($userDict); // Valid!

/** @var Dictionary<int, User> $intDict */
$intDict = new Dictionary();
processStringDictionary($intDict); 
// Throws: TypeError: expected Dictionary<string, *> but Dictionary<int, User> given
```

### 4. Critical Distinction: `SomeClass<*>` vs. `SomeClass<mixed>`

In TypePHP's runtime engine, both `<*>` and `<mixed>` act as universal top-type catch-alls that accept any generic instance (`Shelter<Dog>`, `Shelter<Cat>`, etc.). 

However, **`<*>` is the recommended and idiomatic standard** across modern PHP for two key reasons:

1. **Upper Bound Compliance in Static Analyzers:** If a class declares `@template T of Animal`, strict static analysis flags `Shelter<mixed>` because `mixed` is broader than `Animal`. Using `Shelter<*>` automatically adopts the class's upper bound (`? extends Animal`), passing static analysis cleanly.
2. **Circular Generics:** For self-referencing interfaces (`Entity<Id<*>>`), `<*>` is the formal placeholder that prevents infinite recursion loops.

```php
/**
 * @template T of Animal
 */
class Shelter
{
    public function __construct(public Animal $resident) {}
}

/** @var Shelter<Dog> $dogShelter */
$dogShelter = new Shelter(new Dog());

// 1. Using <*> (Idiomatic Wildcard Standard):
/** @param Shelter<*> $shelter */
function processAnyShelter(Shelter $shelter) { ... }

processAnyShelter($dogShelter); // Valid!

// 2. Using <mixed> (Also permitted at runtime via Top-Type matching):
/** @param Shelter<mixed> $shelter */
function processMixedShelter(Shelter $shelter) { ... }

processMixedShelter($dogShelter); // Valid at runtime!
```

---

## Generics with Unions and Intersections

TypePHP fully supports combining generic structures with Union (`|`) and Intersection (`&`) types, both as item types and as **upper bounds**.

### Unions and Intersections as Template Upper Bounds

You can strictly constrain a generic template `T` to be a member of a union or an object satisfying multiple interfaces via an intersection:

```php
/**
 * Template constrained by a Union Bound
 *
 * @template T of Dog|Cat
 * @param T $pet
 */
function processPet(object $pet): void { ... }

processPet(new Dog()); // Valid
processPet(new Cat()); // Valid
processPet(new Car()); // Throws: TypeError: Argument $pet does not satisfy upper bound (Dog | Cat)

/**
 * Template constrained by an Intersection Bound
 *
 * @template T of Countable&ArrayAccess
 * @param class-string<T> $class
 */
function registerCollection(string $class): void { ... }

registerCollection(ArrayObject::class); // Valid (Implements both)
registerCollection(stdClass::class);    // Throws: TypeError: Argument $class must be a class-string of (Countable & ArrayAccess)
```

### Generic Containers Holding Unions (`Collection<Dog|Cat>`)

```php
/** @var Collection<Dog|Cat> $animals */
$animals = new Collection();

$animals->add(new Dog()); // Valid
$animals->add(new Cat()); // Valid

$animals->add(new Car()); // Invalid: Car is neither Dog nor Cat
// Throws: TypeError: Collection::add(): Argument $item (template T = Dog|Cat) must be of type (Dog | Cat)
```

### Unions of Generic Containers (`Producer<Dog> | Producer<Cat>`)

```php
/**
 * @param Producer<Dog>|Producer<Cat> $producer
 */
function handleAnimalProducer(Producer $producer): void
{
    // ...
}

handleAnimalProducer(new Producer(new Dog())); // Valid
handleAnimalProducer(new Producer(new Cat())); // Valid

handleAnimalProducer(new Producer(new Car())); // Invalid
// Throws: TypeError: Argument $producer must be of type (Producer<Dog> | Producer<Cat>)
```

### Generic Containers Holding Intersections (`Collection<Countable & ArrayAccess>`)

Enforce that generic items must implement multiple interfaces simultaneously:

```php
/** @var Collection<Countable&ArrayAccess> $collections */
$collections = new Collection();

$collections->add(new CountableArrayAccess()); // Valid (Implements both)

$collections->add(new CountableOnly()); // Invalid (Fails ArrayAccess interface)
// Throws: TypeError: Argument $item must be of type (Countable & ArrayAccess)
```

### Complex Unions of Intersections in Generics

You can combine parenthesized unions and intersections inside generic parameters (Disjunctive Normal Form):

```php
/** @var Collection<(Countable&ArrayAccess)|(Iterator&Countable)> $payload */
$payload = new Collection();

$payload->add(new CountableArrayAccess()); // Valid
$payload->add(new ArrayIterator([1, 2]));  // Valid
```

---

## Deeply Nested Generics (`Collection<Producer<Dog>>`)

TypePHP recursively evaluates deeply nested generic structures down to any depth:

```php
/** @var Collection<Producer<Dog>> $producers */
$producers = new Collection();

// Valid Addition
$producers->add(new Producer(new Dog()));

// Invalid Addition (Producer holding Car instead of Dog)
$producers->add(new Producer(new Car()));
// Throws: TypeError: Argument $item must be an instance of Producer<Dog>
```