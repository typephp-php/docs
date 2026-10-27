# Iterators & Generators

TypePHP provides lazy runtime validation for `Traversable` objects, `Iterator` instances, and PHP `Generator` functions, validating yielded keys, values, and generator inputs (`$gen->send()`) on-the-fly during iteration.

---

## How Lazy Iteration Works (`IterableWrapper` & `IteratorProxy`)

When an iterable or generator is passed into a function accepting `Traversable<K, V>` or returned from a function:
1. **Zero Memory Spikes:** TypePHP does not convert the iterator to an array or eagerly load items into RAM.
2. **On-the-Fly Validation:** Keys (`K`) and values (`V`) are validated lazily during iteration at the exact moment each item is accessed inside `current()` or `yield`.
3. **Rewindability Preserved:** `IteratorProxy` unwraps and preserves iterator rewindability, allowing multiple `foreach` loops over the same wrapped iterator without crashing.
4. **Method & Countable Forwarding:** Forwards `Countable::count()` and custom iterator methods directly to the inner iterator using `__call()`.

---

## Generic Streams vs. Concrete Collection Classes (Zero Proxy Overhead)

A critical architectural design in TypePHP is distinguishing between **abstract generic streams** and **concrete collection classes**:

### 1. Abstract Generic Streams (`iterable<T>`, `Traversable<K, V>`, `Generator<K, V>`)
When a method or parameter specifies an abstract stream keyword with inner type constraints:
```php
/**
 * Abstract stream contract -> Wrapped in IteratorProxy
 *
 * @param Traversable<string, positive-int> $scores
 */
public function processScores(Traversable $scores): void
```
Because `Traversable` is a general interface with no methods of its own, TypePHP wraps it in a lazy `IteratorProxy` to validate yielded items and keys during iteration.

### 2. Concrete Collection Classes (`FileCollection`, `ArrayCollection`, `OrderList`)
When a method parameter, property, or return value is a concrete class (even if that class implements `\IteratorAggregate` or `\Traversable`):

TypePHP leaves concrete collections **100% unwrapped as raw PHP objects**:

* **Preserves Native PHP Nominal Type Hints:** Prevents fatal PHP engine errors (e.g. `Cannot assign IteratorProxy to property ...::$styleFiles of type FileCollection`).
* **Preserves Custom Domain Methods & State:** Custom business methods (like `$files->getPublicUrls()` or `$files->filterByExtension()`) and private properties remain directly accessible.
* **Direct `\WeakMap` Enforcement:** For generic concrete classes (like `ArrayCollection<int, Animal>`), TypePHP tracks generic template bindings directly in `\WeakMap` memory, running validation rules inside `$collection->add()` and `$collection->set()` without needing any wrapper proxy!
* **Zero Allocation Overhead:** Eliminates proxy object allocations and garbage collection pressure, allowing concrete collections to run at native C-level speed.

### Summary: When TypePHP Wraps vs. Leaves Unwrapped

| Type Annotation | Object Passed | Action Taken | Why |
| :--- | :--- | :---: | :--- |
| `Traversable<string, positive-int>` | Any Iterator / Generator | **Wrapped in `IteratorProxy`** | Abstract stream; needs lazy item validation during iteration. |
| `iterable<User>` | Any Array / Traversable | **Wrapped in `IteratorProxy`** | Abstract stream; validates items on-the-fly. |
| `FileCollection` | `new FileCollection()` | **Unwrapped (Raw Object)** | Concrete class; preserves native PHP type hints and domain methods. |
| `ArrayCollection<int, Animal>` | `new ArrayCollection()` | **Unwrapped (Raw Object)** | Generic state is tracked directly via `\WeakMap` inside `add()`/`set()`. |
| Un-annotated (`mixed $items`) | Any Iterator | **Unwrapped (Raw Object)** | No type contracts to enforce; zero overhead. |

The interactive snippet below proves that concrete collection classes retain their exact object identity without being replaced by proxy wrappers:

<TypePHPSnippet title="Concrete Collections vs. Abstract Streams" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class FileCollection implements IteratorAggregate
{
    public function __construct(public array $files = []) {}

    public function getIterator(): Traversable
    {
        return new ArrayIterator($this->files);
    }

    public function customDomainMethod(): string
    {
        return 'custom_domain_logic';
    }
}

/**
 * 1. Concrete class parameter: Remains 100% unwrapped raw object!
 */
function handleConcrete(FileCollection $collection): void
{
    echo "✓ Concrete class identity: " . get_class($collection) . "\n";
    echo "✓ Custom domain method accessible: " . $collection->customDomainMethod() . "\n";
}

/**
 * 2. Abstract stream parameter: Wrapped in IteratorProxy for item validation!
 *
 * @param Traversable<string, positive-int> $stream
 */
function handleAbstract(Traversable $stream): void
{
    echo "✓ Abstract stream wrapper: " . get_class($stream) . "\n";
    foreach ($stream as $k => $v) {
        // Validated lazily during iteration!
    }
}

$collection = new FileCollection(['a' => 10, 'b' => 20]);
handleConcrete($collection);

echo "\n";
handleAbstract($collection);
```

</TypePHPSnippet>

---

## Traversable & Iterator Contracts (`Traversable<K, V>`)

Validate keys and values on any `Traversable` or `ArrayIterator` instance lazily during iteration:

<TypePHPSnippet title="Traversable & Iterator Contracts" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param Traversable<non-empty-string, positive-int> $items
 */
function processTraversable(Traversable $items): array
{
    $results = [];
    foreach ($items as $key => $value) {
        $results[$key] = $value;
    }

    return $results;
}

// 1. Happy Path: Valid keys and values
$validIterator = new ArrayIterator(['batch_a' => 10, 'batch_b' => 20]);
$res = processTraversable($validIterator);
echo "✓ Valid iterator processed " . count($res) . " item(s)\n\n";

// 2. Invalid Value: Negative integer -50 violates positive-int
try {
    $badValueIterator = new ArrayIterator(['item1' => 10, 'item2' => -50]);
    processTraversable($badValueIterator);
} catch (\TypeError $e) {
    echo "✗ Caught invalid iterator value:\n   " . $e->getMessage() . "\n\n";
}

// 3. Invalid Key: Empty string violates non-empty-string
try {
    $badKeyIterator = new ArrayIterator(['' => 10]);
    processTraversable($badKeyIterator);
} catch (\TypeError $e) {
    echo "✗ Caught invalid iterator key:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Generic Iterables with Template Substitution (`@template T`)

When a function accepts generic iterables (`iterable<T>` or `Traversable<string, T>`), TypePHP dynamically substitutes `T` with the bound generic type and lazily validates items during iteration:

> **Deep Dive Guide:** For comprehensive details on template bounds, covariance/contravariance, and runtime generic state inspection, see the [Class Generics & Upper Bounds](/generics/class-generics-and-upper-bounds) documentation.

<TypePHPSnippet title="Generic Iterables with Template Substitution" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal { public function __construct(public string $name) {} }
class Dog extends Animal {}
class Cat extends Animal {}
class Vehicle {}

/**
 * @template T of Animal
 *
 * @param Traversable<non-empty-string, T> $stream
 * @return list<T>
 */
function collectAnimalStream(Traversable $stream): array
{
    $collected = [];
    foreach ($stream as $key => $animal) {
        $collected[] = $animal;
    }

    return $collected;
}

// 1. Happy Path: Dogs and Cats extend upper bound Animal
$animalIterator = new ArrayIterator([
    'pet_1' => new Dog('Buddy'),
    'pet_2' => new Cat('Luna'),
]);

$animals = collectAnimalStream($animalIterator);
echo "✓ Successfully streamed " . count($animals) . " animal(s)\n\n";

// 2. Invalid Stream: Vehicle does not extend upper bound Animal
try {
    $badIterator = new ArrayIterator([
        'pet_1' => new Dog('Buddy'),
        'pet_2' => new Vehicle(),
    ]);
    collectAnimalStream($badIterator);
} catch (\TypeError $e) {
    echo "✗ Caught invalid stream element:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Generator Function Contracts (`Generator<TKey, TValue, TSend, TReturn>`)

PHP `Generator` functions allow declaring up to 4 generic parameters:
* **`TKey`:** Type of yielded keys (`yield $key => $val`).
* **`TValue`:** Type of yielded values (`yield $val`).
* **`TSend`:** Type of values sent into the generator via `$gen->send($val)`.
* **`TReturn`:** Type of value returned when the generator completes (`return $val`).

### Lazy Yield Validation (`TKey` & `TValue`)

Validation occurs **lazily on each yield**. Early valid items are yielded cleanly; the engine halts only when an invalid item is actually reached:

<TypePHPSnippet title="Lazy Generator Yield Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Lazy stream yielding non-empty-string keys and positive-int values
 *
 * @return Generator<non-empty-string, positive-int>
 */
function generateMetrics(): Generator
{
    yield 'batch_a' => 10;
    yield 'batch_b' => 20;
    yield 'batch_c' => -5; // Violates positive-int value!
}

$gen = generateMetrics();

// Item 1 and Item 2 yield without error:
echo "✓ Yield 1: {$gen->key()} => {$gen->current()}\n";
$gen->next();

echo "✓ Yield 2: {$gen->key()} => {$gen->current()}\n";

// Advancing to item 3 triggers lazy TypeError on -5:
echo "\nAdvancing to invalid negative yield...\n";
try {
    $gen->next();
} catch (\TypeError $e) {
    echo "✗ Caught lazy yield error:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Generator Input Validation (`$gen->send()` / `TSend`)

TypePHP validates values sent into an interactive bidirectional generator via `$gen->send()` against the declared `TSend` contract parameter:

<TypePHPSnippet title="Interactive Generator Input Validation (TSend)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * TKey = int, TValue = string, TSend = positive-int, TReturn = void
 *
 * @return Generator<int, string, positive-int, void>
 */
function interactiveQuota(): Generator
{
    $quota = yield 1 => 'Awaiting quota allocation:';
    echo "✓ Received valid quota allocation: +{$quota}\n";
}

// 1. Happy Path: 500 satisfies positive-int TSend
$gen = interactiveQuota();
$gen->current(); // Advances to first yield
$gen->send(500);

echo "\n";

// 2. Invalid Send: Passing negative integer violates positive-int TSend
try {
    $badGen = interactiveQuota();
    $badGen->current();
    echo "Sending invalid negative quota -100...\n";
    $badGen->send(-100);
} catch (\TypeError $e) {
    echo "✗ Caught invalid TSend error:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Delegated Generators (`yield from`)

TypePHP seamlessly intercepts delegated `yield from` expressions, lazily validating keys and values yielded from nested iterators or arrays:

<TypePHPSnippet title="Delegated Generators (yield from)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @return Generator<string, positive-int>
 */
function parentStream(): Generator
{
    // Yield from valid sub-array
    yield from ['a' => 10, 'b' => 20];

    // Yield from sub-array containing invalid negative integer
    yield from ['c' => -99];
}

$stream = parentStream();

try {
    foreach ($stream as $key => $val) {
        echo "✓ Yielded: {$key} => {$val}\n";
    }
} catch (\TypeError $e) {
    echo "✗ Caught invalid yield from element:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Complex Yield & Send Types (Array Shapes, Generics & Lists)

Because `GeneratorChecker` delegates key, value, and `TSend` validation directly to TypePHP's central validator engine, **all complex types (array shapes, lists, generic objects, unions) are fully enforced inside generator signatures**:

<TypePHPSnippet title="Complex Shapes & Actions in Generators" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Generator yielding Array Shapes and accepting Action Shapes in $gen->send()
 *
 * @return Generator<int, array{id: positive-int, username: non-empty-string}, array{action: 'approve'|'reject'}, void>
 */
function processApprovalPipeline(): Generator
{
    $decision = yield 1 => ['id' => 101, 'username' => 'Alice'];
    echo "✓ Decision received: {$decision['action']}\n";
}

// 1. Happy Path: Valid yielded shape and valid action sent
$gen = processApprovalPipeline();
$userRecord = $gen->current();
echo "✓ Yielded User: #{$userRecord['id']} - {$userRecord['username']}\n";
$gen->send(['action' => 'approve']);

echo "\n";

// 2. Invalid Action Sent: 'delete' violates 'approve'|'reject'
try {
    $badGen = processApprovalPipeline();
    $badGen->current();
    echo "Sending invalid action 'delete'...\n";
    $badGen->send(['action' => 'delete']);
} catch (\TypeError $e) {
    echo "✗ Caught invalid TSend shape error:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Multi-Level `IteratorAggregate` Unwrapping & Method Forwarding

When passing custom classes implementing `IteratorAggregate`, `IteratorProxy` recursively unwraps the inner iterator while preserving method forwarding and `Countable` support:

<TypePHPSnippet title="IteratorAggregate Unwrapping & Method Forwarding" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class OrderAggregate implements IteratorAggregate, Countable
{
    public function __construct(private array $orders = ['order_1' => 100, 'order_2' => 250]) {}

    public function getIterator(): Traversable
    {
        return new ArrayIterator($this->orders);
    }

    public function count(): int
    {
        return count($this->orders);
    }

    public function getSummaryTitle(): string
    {
        return 'Monthly Order Audit';
    }
}

/**
 * @param Traversable<non-empty-string, positive-int> $stream
 */
function auditStream(Traversable $stream): void
{
    // 1. Countable::count() is forwarded through IteratorProxy
    echo "✓ Stream Count: " . count($stream) . "\n";

    // 2. Custom domain methods forwarded via __call()
    echo "✓ Custom Method: " . $stream->getSummaryTitle() . "\n";

    // 3. Iteration validates on-the-fly
    foreach ($stream as $k => $v) {
        echo "  • {$k}: \${$v}\n";
    }
}

$aggregate = new OrderAggregate();
auditStream($aggregate);
```

</TypePHPSnippet>