# Arrays & Shapes

TypePHP provides runtime enforcement for sequential lists, key-value generic maps, typed arrays, positional tuples, sealed and unsealed array shapes, schema composition, homogeneous/heterogeneous unions, variadic array wrapping, key/value extractions, offset access, and object shapes.

---

## Sequential Lists (`list<T>` & `non-empty-list<T>`)

A `list<T>` represents a sequential, 0-indexed integer key array without gaps (`0, 1, 2, ...`). TypePHP validates lists at runtime using PHP's native `array_is_list()` function in C:

<TypePHPSnippet title="Sequential Lists & Refinements" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param list<non-empty-string> $tags
 * @param non-empty-list<positive-int> $scores
 */
function processMetrics(array $tags, array $scores): void
{
    echo "✓ Verified list of " . count($scores) . " score(s)\n";
    echo "✓ Tags: " . implode(', ', $tags) . "\n\n";
}

// 1. Valid Call
processMetrics(['php', 'pest', 'typephp'], [10, 20, 30]);

// 2. Invalid Call (Associative array passed where sequential list is expected)
echo "Passing associative keys where list is expected...\n";
processMetrics(['tag1' => 'php'], [10, 20]);
```

</TypePHPSnippet>

---

## Array Validation Strategies (`full` vs `hybrid`)

Validating collection structures (`list<T>`, `array<K, V>`, `Type[]`) can be configured in `typephp.php` via `'array_validation'`:

```php:line-numbers
// typephp.php
return [
    'array_validation' => 'full', // 'full' (default) or 'hybrid'
];
```

TypePHP provides two strategies inspired by Cecil Curry's work on Python's Beartype: **Strict Full Mode** ($O(n)$) and **Beartype Hybrid Mode** ($O(1)$).

---

### Comparing Full Mode vs. Hybrid Mode

| Feature / Trait | Strict Full Mode (`'full'`, Default) | Beartype Hybrid Mode (`'hybrid'`) |
| :--- | :--- | :--- |
| **Complexity** | $O(n)$ linear time | $O(1)$ constant time for $N > 128$ items |
| **Coverage** | 100% exhaustive scan | 100% on $N \le 128$; boundary + 3 random samples on $N > 128$ |
| **Offending Elements** | Guaranteed to catch every single violation | High probabilistic certainty; always catches boundary issues |
| **Throughput Impact** | Increases with dataset size | Flat, predictable sub-millisecond execution regardless of size |
| **Best Used For** | Unit tests, CI/CD pipelines, local dev, small-to-medium payloads | High-throughput web servers, massive database batches, ETL pipelines |

---

### Strict Full Mode (`'full'`)

Full mode scans every element from index `0` to `count - 1`.

- **Pros:**
  - **100% Deterministic Guarantee:** Impossible for an invalid item to slip through unnoticed, even if it is a single corrupt row hidden in the middle of 50,000 items.
  - **Zero Heuristics:** Ideal for unit testing, CI pipelines, and financial/audit systems where data integrity is paramount.
  - **Optimized Happy Path:** Zero string allocations during successful passes; error context paths are constructed only upon failure.
- **Cons:**
  - **Linear Latency Growth:** Validating 50,000–100,000 elements in a single request can add tens of milliseconds of CPU execution time.

---

### Beartype Hybrid Mode (`'hybrid'`)

Hybrid mode provides constant-time $O(1)$ validation for collections exceeding 128 items (`Config::HYBRID_SAMPLE_THRESHOLD`):
1. Verifies overall container integrity in C via native `array_is_list()`.
2. Validates boundaries: the first element (`$arr[0]`) and last element (`$arr[count - 1]`).
3. Validates 3 random internal elements picked via pseudo-random sampling.

- **Pros:**
  - **Massive Performance Boost:** Validating 100,000 items drops from **~80 ms down to ~0.8 ms (up to 97x faster)**.
  - **Predictable Request Lifetimes:** Eliminates tail latency spikes in web APIs processing large JSON or database result sets.
  - **Automatic Fallback:** Arrays with $\le 128$ items automatically receive a 100% full scan, ensuring smaller lists never skip checks.
- **Cons:**
  - **Probabilistic Catching on Huge Arrays:** If an invalid item is buried at index `42,109` of an otherwise valid 100,000-item array, random sampling may miss it on that specific pass unless it falls on the boundaries or sampled indices.

---

### Benchmark: Full $O(n)$ vs. Hybrid $O(1)$ Sampling

The snippet below generates a list of 15,000 positive integers and measures validation time using `microtime(true)`:

<TypePHPSnippet 
  title="Array Validation Benchmark (Full vs. Hybrid)" 
  :config="{ arrayValidation: 'full' }" 
  default-view="source"
>

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param list<positive-int> $dataset
 */
function validateLargeDataset(array $dataset): void {}

// Generate 15,000 positive integers
$data = range(1, 15000);

echo "Starting validation of " . count($data) . " items...\n";

$start = microtime(true);
for ($i = 0; $i < 5; $i++) {
    validateLargeDataset($data);
}
$elapsed = (microtime(true) - $start) * 1000;

echo sprintf("✓ Completed 5 passes in %.2f ms\n", $elapsed);
```

</TypePHPSnippet>

### Try the Performance Challenge:
1. Click **Run** on the snippet above while in default **Full Mode** and check the elapsed time.
2. Open the snippet's **Configuration (⚙️)** menu.
3. Switch **Array Validation** from **Full** to **Hybrid**.
4. Click **Run** again! Notice how the execution time drops into constant $O(1)$ nanoseconds.

---

## Key-Value Generic Arrays (`array<K, V>` & `T[]`)

TypePHP enforces specific key and value types on associative or indexed arrays:

<TypePHPSnippet title="Generic Key-Value Arrays" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param array<string, int<1, 100>> $thresholds
 */
function configureThresholds(array $thresholds): void
{
    echo "✓ Configured " . count($thresholds) . " threshold rule(s)\n\n";
}

// 1. Valid map matching string keys and 1-100 integer range bounds
configureThresholds([
    'cpu_alert'  => 85,
    'disk_alert' => 90,
]);

// 2. Invalid Call: Integer key passed where string key is required!
echo "Passing integer key where string key was expected...\n";
configureThresholds([
    100 => 85,
]);
```

</TypePHPSnippet>

### Typed Scalar, Refinement & Callable Arrays (`positive-int[]`, `callable[]`)

In addition to typed class arrays (`User[]`), TypePHP validates arrays of primitives, scalar refinements, callables, or shapes using `T[]` syntax:

<TypePHPSnippet title="Typed Scalar and Callable Arrays" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int[] $ids
 * @param callable[] $callbacks
 */
function processQueue(array $ids, array $callbacks): void
{
    echo "✓ Queue processed with " . count($ids) . " items\n\n";
}

// 1. Valid Call
processQueue(
    ids: [10, 20, 30],
    callbacks: [fn () => null, 'strlen']
);

// 2. Invalid Call: -50 violates positive-int[]!
echo "Passing negative integer into positive-int[]...\n";
processQueue(
    ids: [10, -50, 30],
    callbacks: [fn () => null]
);
```

</TypePHPSnippet>

> **WeakMap Object Memoization:** When validating arrays of objects (such as `User[]`), TypePHP memoizes previously checked object instances in a `\WeakMap`. If the same object instance appears multiple times in a collection, its type is checked once and retrieved in $O(1)$ time on subsequent accesses.

---

## Array Covariance & Dynamic Safety (vs. Java's Mistake)

In TypePHP, **arrays and lists are covariant**: a `list<Dog>` can be safely passed anywhere a `list<Animal>` or `Animal[]` is expected.

---

### The Java Dilemma: Loss of Compile-Time Safety on Shared Heap Buffers

In statically compiled languages like Java, array covariance is widely considered one of the language's early architectural design mistakes. In Java, arrays are mutable reference types pointing to a shared memory buffer on the heap:

```java
// Java:
Dog[] dogs = new Dog[2];
Object[] objects = dogs; // Allowed via Java's array covariance

// Runtime crash! Both variables point to the exact same memory buffer.
// Java lost compile-time safety and must check every write at runtime, throwing ArrayStoreException!
objects[0] = new Cat(); 
```

Because Java arrays are shared pointers on the heap, allowing covariance broke compile-time safety, leaving developers vulnerable to runtime crashes.

---

### Why Array Covariance is Safe in TypePHP

TypePHP avoids this pitfall through two fundamental mechanics: **Zend Engine Value Semantics** and **Dynamic Reified Checks**.

#### 1. Copy-on-Write (COW) Value Semantics
Unlike Java, PHP arrays are values governed by Copy-on-Write (`zend_array`). Passing an array to a function passes an isolated value. If the receiving function attempts to write an element (`$animals[] = new Cat()`), PHP duplicates the internal array buffer on the spot. **The caller's original array is never modified or corrupted.**

#### 2. Reified Dynamic Verification
Because TypePHP evaluates types dynamically at runtime boundaries rather than erasing them, container types remain active. If an array crosses into a function, TypePHP verifies the items on entry and enforces return boundaries on exit.

<TypePHPSnippet title="Array Covariance & Copy-on-Write Safety" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal { public function __construct(public string $name) {} }
class Dog extends Animal {}
class Cat extends Animal {}

/**
 * Accepts list<Animal> - Covariance safely allows list<Dog>!
 *
 * @param list<Animal> $animals
 */
function inspectAnimals(array $animals): void
{
    echo "✓ Read " . count($animals) . " animal(s) safely via covariance\n";

    // PHP's Copy-on-Write duplicates the array buffer here!
    // The caller's original array is never modified or corrupted.
    $animals[] = new Cat('Felix'); 
    echo "  (Internal array modified with Cat via Copy-on-Write)\n";
}

/** @var list<Dog> */
$dogs = [new Dog('Buddy'), new Dog('Rex')];

// 1. Array covariance permits passing list<Dog> where list<Animal> is expected
inspectAnimals($dogs);

// 2. The caller's array remains 100% list<Dog> due to PHP's Copy-on-Write!
echo "\nCaller dogs count: " . count($dogs) . " (Still pristine Dog list!)\n";
foreach ($dogs as $dog) {
    echo "  • {$dog->name}: " . get_class($dog) . "\n";
}
```

</TypePHPSnippet>

---

### The Alternative: Why Invariant Arrays Would Hurt Developer Experience

If TypePHP treated native arrays as strictly invariant (demanding an exact match where `list<Dog>` is rejected by `list<Animal>`), working with everyday PHP arrays would become excruciatingly rigid:
- Composing array schemas, pipeline transforms, and data mappers would require manual `array_map()` casts just to change the type label of an array.
- Polymorphic functions that only read data would reject specialized lists, forcing developers into verbose workarounds.

Array covariance preserves the natural, ergonomic flexibility of PHP arrays while remaining safe under value semantics.

---

### Need Strictly Invariant Arrays? Use a Generic Collection Class

If your domain model requires strict invariance (for example, a shared read-write storage buffer where pushing a subtype must be explicitly forbidden), **wrap the array in a generic invariant class**:

```php:line-numbers
/**
 * Generic classes are INVARIANT by default in TypePHP!
 *
 * @template T
 */
class InvariantCollection
{
    /** @var array<int, T> */
    public array $items = [];

    /** @param T $item */
    public function add(mixed $item): void
    {
        $this->items[] = $item;
    }
}
```

Because generic classes are invariant by default, `InvariantCollection<Dog>` will be strictly rejected if passed to `InvariantCollection<Animal>`, protecting mutable shared object references from contamination.

::: tip Learn More About Class Invariance
Explore how TypePHP reifies generic classes and enforces invariance on mutable objects in the [Class Generics & Upper Bounds](/generics/class-generics-and-upper-bounds) guide.
:::

---

### By-Reference Array Mutations (Actively Guarded by TypePHP)

The only scenario where array covariance could introduce corruption in PHP is when an array is modified **by reference (`&$array`)** or via a reference alias (`&$item`), opting out of Copy-on-Write.

Unlike Java, TypePHP actively guards by-reference mutations:
- **Out-Parameters (`@param-out`):** Validates the modified array upon function exit.
- **By-Reference Loops (`foreach ($dogs as &$dog)`):** Automatically injects a post-boundary check to verify that no incompatible subtypes were assigned inside the loop.

<TypePHPSnippet title="Guarded By-Reference Array Mutation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal { public function __construct(public string $name) {} }
class Dog extends Animal {}
class Cat extends Animal {}

/** @var list<Dog> */
$dogs = [
    new Dog('Buddy'), 
    new Dog('Max'),
];

echo "Iterating dogs by reference and attempting mutation...\n";

// Modifying an element by reference opts out of Copy-on-Write:
foreach ($dogs as &$dog) {
    if ($dog->name === 'Max') {
        // Attempting to sneak a Cat into what must remain a list<Dog>!
        $dog = new Cat('Imposter');
    }
}
unset($dog);

echo "This line will never be reached due to loop post-boundary check!\n";
```

</TypePHPSnippet>

When the loop concludes, TypePHP's injected boundary assertion inspects the container, catches the `Cat`, and halts execution:

```text
Fatal error: Uncaught TypePHP\Exception\TypeError: Variable $dogs[1] must be of type Dog, Cat given in playground.php on line 27
```
---

## Homogeneous vs. Heterogeneous Collections

TypePHP strictly differentiates between **homogeneous collections** (where every item must share the exact same type) and **heterogeneous collections** (where items may vary according to a union):

- **Homogeneous Union (`User[] | Admin[]`):** The array must be **100% `User`** OR **100% `Admin`**. Mixed arrays containing both types are strictly rejected.
- **Heterogeneous Array (`(User | Admin)[]` or `list<User|Admin>`):** The array may freely contain a **mix of `User` and `Admin`** elements.

<TypePHPSnippet title="Homogeneous vs. Heterogeneous Arrays" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class User {}
class Admin {}

/**
 * Homogeneous Union: Must be an array of all Users OR all Admins
 *
 * @param User[]|Admin[] $accounts
 */
function processHomogeneous(array $accounts): void
{
    echo "✓ Homogeneous accounts verified\n";
}

/**
 * Heterogeneous Array: Accepts a mixed list of Users and Admins
 *
 * @param (User|Admin)[] $accounts
 */
function processHeterogeneous(array $accounts): void
{
    echo "✓ Heterogeneous accounts verified\n\n";
}

$mixedAccounts = [new User(), new Admin()];

// 1. Passes Heterogeneous Array check
processHeterogeneous($mixedAccounts);

// 2. Fails Homogeneous Union check (contains both Users and Admins)!
echo "Passing mixed array to Homogeneous Union (User[]|Admin[])...\n";
processHomogeneous($mixedAccounts);
```

</TypePHPSnippet>

---

## Sealed vs. Unsealed Array Shapes

Array shapes define exact key-value contracts for associative arrays:

- **Sealed Shapes (Default):** Extra unexpected keys are strictly forbidden.
- **Unsealed Shapes (`...<K, V>`):** Extra dynamic key-value pairs matching `<K, V>` are permitted.

<TypePHPSnippet title="Sealed vs. Unsealed Shapes" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Sealed: Extra keys strictly forbidden
 * @param array{id: positive-int, username: non-empty-string} $data
 */
function processSealed(array $data): void
{
    echo "✓ Sealed user verified: {$data['username']}\n";
}

/**
 * Unsealed: Allows additional string metadata
 * @param array{id: positive-int, ...<string, string>} $data
 */
function processUnsealed(array $data): void
{
    echo "✓ Unsealed verified with " . count($data) . " item(s)\n\n";
}

// 1. Valid calls
processSealed(['id' => 1, 'username' => 'Alice']);
processUnsealed(['id' => 1, 'role' => 'admin', 'dept' => 'engineering']);

// 2. Extra key triggers TypeError on sealed shape
echo "Passing unexpected key 'draft' to sealed shape...\n";
processSealed([
    'id' => 1,
    'username' => 'Alice',
    'draft' => true,
]);
```

</TypePHPSnippet>

---

## Schema Composition via Intersections (`ShapeA & ShapeB`)

TypePHP supports schema composition by intersecting multiple sealed or unsealed array shapes. Declared fields are merged into a single composite schema while preserving strict sealed boundaries against unexpected keys:

<TypePHPSnippet title="Array Shape Composition (ShapeA & ShapeB)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @phpstan-type Identifiable array{id: positive-int, created_at: non-empty-string}
 * @phpstan-type Taggable     array{tags: list<non-empty-string>}
 * @phpstan-type ArticlePayload Identifiable & Taggable
 */
class ArticleService
{
    /**
     * @param ArticlePayload $payload
     */
    public function publish(array $payload): void
    {
        echo "✓ Published Article #{$payload['id']} with " . count($payload['tags']) . " tag(s)\n";
    }
}

$service = new ArticleService();

// 1. Valid: Merges both schemas seamlessly
$service->publish([
    'id' => 101,
    'created_at' => '2026-09-26',
    'tags' => ['php', 'typephp', 'runtime'],
]);

// 2. Sealed Safety: Extra unexpected keys are strictly rejected!
echo "\nPassing unexpected extra key 'draft'...\n";
$service->publish([
    'id' => 102,
    'created_at' => '2026-09-26',
    'tags' => ['release'],
    'draft' => true,
]);
```

</TypePHPSnippet>

::: tip Composing Schemas with Type Aliases
Notice how `@phpstan-type` enables defining modular, reusable shape contracts that compose cleanly via intersections (`Identifiable & Taggable`). 

To learn how to define, export, and import modular schemas across different classes, check out the [Type Aliases (`@phpstan-type`) Guide](/supported-types/type-aliases).
:::

### Overlapping Key Refinement

When intersected shapes declare the same key with different constraints, TypePHP unifies them into an intersected constraint (e.g. `score: int` and `score: positive-int` unifies to `score: int & positive-int`):

<TypePHPSnippet title="Overlapping Key Refinement in Composed Shapes" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param (array{score: int, label: non-empty-string} & array{score: positive-int}) $payload
 */
function recordScore(array $payload): void
{
    echo "✓ Recorded score: {$payload['score']} ({$payload['label']})\n";
}

// 1. Valid: 50 satisfies (int & positive-int)
recordScore(['score' => 50, 'label' => 'passed']);

// 2. Invalid: -10 satisfies int, but fails positive-int constraint in the intersection!
echo "\nPassing negative score into intersected shape...\n";
recordScore(['score' => -10, 'label' => 'failed']);
```

</TypePHPSnippet>


---

## Discriminator-Aware Tagged Unions

When validating discriminated unions (tagged unions where branches share a discriminator field like `type` or `status`), TypePHP isolates the matching branch and diagnoses the **exact failing field** within it rather than falsely blaming the discriminator key:

<TypePHPSnippet title="Discriminator-Aware Tagged Unions" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void
{
    echo "✓ Handled event: {$event['type']}\n";
}

// 1. Valid calls
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'scroll', 'offset' => 150]);

// 2. TypePHP pinpoints the exact failing field ('element') on the matched branch!
// It does NOT falsely claim type must be 'click'.
echo "\nPassing hover event with empty element string...\n";
handleEvent([
    'type' => 'hover',
    'element' => '',
]);
```

</TypePHPSnippet>

---

## Positional Tuple Shapes (`array{0: T1, 1: T2}` & Keyless Tuples)

Define fixed-length, positional array tuples with required and optional items:

<TypePHPSnippet title="Positional Tuple Shapes" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Positional Tuple with Optional Trailing Element
 *
 * @param array{0: positive-int, 1: non-empty-string, 2?: bool} $tuple
 */
function processTuple(array $tuple): void
{
    echo "✓ Tuple item #{$tuple[0]}: {$tuple[1]}\n";
}

// 1. Valid Call (Optional index 2 omitted)
processTuple([100, 'success']);

// 2. Valid Call (Optional index 2 provided)
processTuple([100, 'success', true]);

// 3. Invalid Call (Index 0 is negative integer)
echo "\nPassing negative ID into index 0...\n";
processTuple([-5, 'success']);
```

</TypePHPSnippet>

---

## Implicit Keyless Tuple Syntax (`array{T1, T2}`)

TypePHP fully supports implicit keyless tuple syntax (e.g. `array{list<positive-int>, non-empty-string}`), automatically mapping sequential indices to their respective type contracts:

<TypePHPSnippet title="Implicit Keyless Tuples" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Index 0 must be list<positive-int>, Index 1 must be non-empty-string
 *
 * @param array{list<positive-int>, non-empty-string} $bundle
 */
function processBundle(array $bundle): void
{
    echo "✓ Processed bundle with " . count($bundle[0]) . " items: {$bundle[1]}\n";
}

// 1. Valid Call
processBundle([[10, 20, 30], 'active_bundle']);

// 2. Invalid Call: Nested list contains negative integer -5!
echo "\nPassing bundle with negative integer in nested list...\n";
processBundle([[10, -5, 30], 'active_bundle']);
```

</TypePHPSnippet>

---

## Key & Value Extraction (`key-of<T>` & `value-of<T>`)

TypePHP supports dynamically restricting parameters, return types, or shape fields to the keys or values of an array constant, an array shape, or an Enum using `key-of<T>` and `value-of<T>`:

<TypePHPSnippet title="key-of and value-of Extractions" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

enum TransactionStatus: string 
{
    case PENDING = 'pending';
    case COMPLETED = 'completed';
    case FAILED = 'failed';
}

class DatabaseMap 
{
    public const DRIVERS = [
        'mysql' => 'PDO\\MySQL\\Driver',
        'pgsql' => 'PDO\\PgSQL\\Driver',
    ];
}

/**
 * @param key-of<TransactionStatus> $statusName
 * @param value-of<TransactionStatus> $statusValue
 * @param key-of<DatabaseMap::DRIVERS> $driverKey
 */
function configurePayment(string $statusName, string $statusValue, string $driverKey): void 
{
    echo "✓ Configured: Status={$statusName} ({$statusValue}), Driver={$driverKey}\n";
}

// 1. Valid call
configurePayment('COMPLETED', 'completed', 'mysql');

// 2. Passing invalid driver key triggers TypeError!
echo "\nPassing invalid driver key 'sqlite'...\n";
configurePayment('COMPLETED', 'completed', 'sqlite');
```

</TypePHPSnippet>

---

## Offset Access Types (`T[K]` & `T[K1][K2]`)

TypePHP evaluates offset access lookups on array shapes, constant arrays, and `@phpstan-type` aliases at the AST level before validation runs, executing type checks at **$O(1)$ constant speed**:

<TypePHPSnippet title="Offset Access Types (T[K])" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @phpstan-type DatabaseConfig array{
 *     connection: array{
 *         port: int<1, 65535>,
 *         driver: 'mysql'|'pgsql'
 *     }
 * }
 */
class DatabaseService
{
    public const DRIVERS = [
        'mysql' => 'PDO\\MySQL\\Driver',
    ];

    /**
     * Resolves Multi-Level Offset DatabaseConfig['connection']['port'] -> int<1, 65535>
     * Resolves Constant Offset self::DRIVERS['mysql'] -> literal 'PDO\MySQL\Driver'
     *
     * @param DatabaseConfig['connection']['port'] $port
     * @param self::DRIVERS['mysql'] $driverClass
     */
    public function configure(int $port, string $driverClass): void
    {
        echo "✓ Configured on port {$port} with {$driverClass}\n";
    }
}

$service = new DatabaseService();

// 1. Valid call
$service->configure(3306, 'PDO\\MySQL\\Driver');

// 2. Invalid port: 70000 exceeds int<1, 65535> extracted from offset!
echo "\nPassing port 70000 exceeding int<1, 65535>...\n";
$service->configure(70000, 'PDO\\MySQL\\Driver');
```

</TypePHPSnippet>

---

## Object Shapes (`object{prop: type}` & `stdClass{prop: type}`)

While array shapes enforce structure on associative arrays, **Object Shapes** enforce structural contracts on PHP objects (`object{prop: type}` or `stdClass{prop: type}`). 

This is particularly useful when decoding dynamic JSON payloads via `json_decode($json, false)`, interacting with third-party HTTP SDKs, or validating un-typed DTOs.

### Generic Object Shapes (`object{prop: type}`)

A generic object shape accepts **any** object instance (whether a `stdClass`, an anonymous class, or a concrete typed class) as long as it exposes the required properties:

<TypePHPSnippet title="Generic Object Shapes (object{...})" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Accepts ANY object with id and username properties
 *
 * @param object{id: positive-int, username: non-empty-string, role?: 'admin'|'user'} $user
 */
function renderUserBadge(object $user): void
{
    $role = $user->role ?? 'standard';
    echo "✓ Rendered badge for #{$user->id}: {$user->username} ({$role})\n";
}

// 1. Valid: stdClass (e.g. from json_decode)
$std = new stdClass();
$std->id = 42;
$std->username = 'Alice';
renderUserBadge($std);

// 2. Valid: Custom Class with typed properties
class AppUser {
    public function __construct(public int $id, public string $username, public string $role) {}
}
renderUserBadge(new AppUser(101, 'Bob', 'admin'));

// 3. Invalid: Missing required username property!
echo "\nPassing stdClass missing required username property...\n";
$incomplete = new stdClass();
$incomplete->id = 50;
renderUserBadge($incomplete);
```

</TypePHPSnippet>

---

## Strict `stdClass` Shapes (`stdClass{prop: type}`)

If an API specifically demands raw dynamic objects from `json_decode()` and must strictly reject custom domain classes, you can specify `stdClass{prop: type}`:

<TypePHPSnippet title="Strict stdClass Shapes (stdClass{...})" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Strictly requires stdClass! Custom domain classes are rejected.
 *
 * @param stdClass{id: positive-int, token: non-empty-string} $session
 */
function authenticateJsonSession(stdClass $session): void
{
    echo "✓ Authenticated stdClass session #{$session->id}\n";
}

class CustomSession
{
    public int $id = 1;
    public string $token = 'tok_123';
}

// 1. Valid stdClass instance
$rawJsonSession = new stdClass();
$rawJsonSession->id = 10;
$rawJsonSession->token = 'secret_bearer_token';
authenticateJsonSession($rawJsonSession);

// 2. Invalid: Custom domain class is rejected!
echo "\nPassing CustomSession class to strict stdClass contract...\n";
authenticateJsonSession(new CustomSession());
```

</TypePHPSnippet>

---

## Deep Property Chains & Diagnostic Breadcrumbs (4+ Levels Deep)

TypePHP recursively evaluates deeply nested object and array shapes down to any depth, constructing accurate diagnostic breadcrumbs:

<TypePHPSnippet title="Deep Object Shape Diagnostics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * 4-level deep object shape
 *
 * @param object{company: object{department: object{lead: object{name: non-empty-string}}}} $user
 */
function assignLead(object $user): void
{
    echo "✓ Assigned lead: {$user->company->department->lead->name}\n";
}

// 1. Valid deep object shape
$validUser = (object)[
    'company' => (object)[
        'department' => (object)[
            'lead' => (object)[
                'name' => 'Alice',
            ],
        ],
    ],
];
assignLead($validUser);

// 2. Deep Field Error: Pinpoints the 4th level down!
$invalidUser = (object)[
    'company' => (object)[
        'department' => (object)[
            'lead' => (object)[
                'name' => '', // Fails non-empty-string!
            ],
        ],
    ],
];

echo "\nPassing deep object with empty lead name...\n";
assignLead($invalidUser);
```

</TypePHPSnippet>

### Safe Inspection of Uninitialized Readonly Properties

If an object instance contains uninitialized PHP 8.1+ `readonly` properties, TypePHP's `ObjectShapeValidator` safely inspects property initialization states using Reflection before attempting reads:

```php:line-numbers
class UserContainer
{
    public readonly int $id; // Uninitialized
}

/** @param object{id: positive-int} $obj */
function verifyContainer(object $obj): void { ... }

verifyContainer(new UserContainer());
// Throws: TypeError: verifyContainer(): Argument $obj property 'id' is uninitialized
```
