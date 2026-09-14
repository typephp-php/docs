# Arrays & Shapes

TypePHP provides runtime enforcement for sequential lists, key-value generic maps, typed class arrays, positional tuples, sealed and unsealed array shapes, shape composition, homogeneous/heterogeneous unions, variadic array wrapping, key/value extractions, offset access, and object shapes.

---

## Sequential Lists (`list<T>` & `non-empty-list<T>`)

A `list<T>` represents a sequential, 0-indexed integer key array without gaps (`0, 1, 2, ...`). TypePHP validates lists at runtime using PHP's native `array_is_list()` function in C:

```php
<?php

declare(strict_types=1);

/**
 * @param list<non-empty-string> $tags
 * @param non-empty-list<positive-int> $scores
 */
function processList(array $tags, array $scores): void
{
    // ...
}

// 1. Valid Call
processList(['php', 'pest', 'typephp'], [10, 20, 30]);

// 2. Invalid Call (Associative array passed where list was expected)
processList(['tag1' => 'php'], [10, 20]);
// Throws: TypeError: processList(): Argument $tags must be a list, associative array (key 'tag1') given

// 3. Invalid Call (Empty array passed where non-empty-list was expected)
processList(['php'], []);
// Throws: TypeError: processList(): Argument $scores must be a non-empty list, empty array ([]) given
```

---

## Array Validation Strategies (`full` vs `hybrid`)

TypePHP provides two collection validation strategies configured in `typephp.php`:

```php
// typephp.php
return [
    'array_validation' => 'full', // 'full' (default) or 'hybrid'
];
```

### 1. Strict Full Mode (`'array_validation' => 'full'`, Default)
* **Exhaustive O(n) Check:** Validates every single element in the collection regardless of size.
* **100% Deterministic Guarantee:** Guarantees that any offending item anywhere in an array will trigger an immediate `TypeError`.
* **Zero-Allocation Happy Path:** Context path strings are constructed only when a validation check fails, ensuring zero throwaway string allocations in memory during valid iterations.

### 2. Beartype Hybrid Mode (`'array_validation' => 'hybrid'`)
* **Small Collections ($N \le 128$ items):** Executes a 100% full scan.
* **Large Collections ($N > 128$ items):** Executes O(1) constant-time sampling:
  1. Shallow check via native `array_is_list()` in C.
  2. Boundary checks on the first element (`$arr[0]`) and last element (`$arr[count - 1]`).
  3. Random walk sampling across 3 internal elements.
* Reduces validation latency on massive 100,000-item arrays from **81 seconds to 0.83 seconds (97x faster)**.

---

## Key-Value Generic Arrays (`array<K, V>` & `T[]`)

TypePHP enforces specific key and value types on associative or indexed arrays:

### Generic Key-Value Arrays (`array<K, V>`)

```php
/**
 * @param array<string, positive-int> $userScores
 */
function recordScores(array $userScores): void
{
    // ...
}

// 1. Valid Call
recordScores(['alice' => 100, 'bob' => 95]);

// 2. Invalid Call (Key 0 is integer instead of string)
recordScores([0 => 100]);
// Throws: TypeError: recordScores(): Argument $userScores key must be of type string, int (0) given

// 3. Invalid Call (Value -5 violates positive-int)
recordScores(['alice' => -5]);
// Throws: TypeError: recordScores(): Argument $userScores['alice'] must be of type positive-int, negative int (-5) given
```

> **Associative Hybrid Validation:** In hybrid mode, associative arrays validate both the key and the value on the first pair, the last pair, and 3 random internal pairs in O(1) time.

### Typed Scalar, Refinement, & Callable Arrays (`positive-int[]`, `non-empty-string[]`, `callable[]`)

In addition to typed class arrays (`User[]`), TypePHP validates arrays of primitives, scalar refinements, callables, or shapes using `T[]` syntax:

```php
/**
 * @param positive-int[] $ids
 * @param non-empty-string[] $tags
 * @param callable[] $callbacks
 * @param array{id: positive-int}[] $userShapes
 */
function processTypedArrays(array $ids, array $tags, array $callbacks, array $userShapes): void
{
    // ...
}

// Valid Call
processTypedArrays(
    ids: [10, 20, 30],
    tags: ['php', 'pest'],
    callbacks: [fn () => null, 'strlen'],
    userShapes: [['id' => 1], ['id' => 2]]
);

// Invalid Call (-50 violates positive-int[])
processTypedArrays(
    ids: [10, -50, 30],
    tags: ['php', 'pest'],
    callbacks: [fn () => null],
    userShapes: [['id' => 1]]
);
// Throws: TypeError: processTypedArrays(): Argument $ids[1] must be of type positive-int, negative int (-50) given
```

> **WeakMap Object Memoization:** When validating arrays of objects (such as `User[]`), TypePHP memoizes previously checked object instances in a `\WeakMap`. If the same object instance appears multiple times in a collection, its type is checked once and retrieved in $O(1)$ time on subsequent accesses.

---

## Homogeneous vs. Heterogeneous Collections

TypePHP strictly differentiates between **homogeneous collections** (where every item must share the exact same type) and **heterogeneous collections** (where items may vary according to a union or wildcard):

### 1. Homogeneous Arrays (`int[]`, `list<string>`, `array<string, User>`)
Every item in the collection must strictly satisfy a single concrete type.

```php
/** @param list<string> $items */
function processHomogeneous(array $items): void {}

processHomogeneous(['a', 'b', 'c']); // Valid
processHomogeneous(['a', 10, 'c']);   // Throws: TypeError: Argument $items[1] must be of type string, int (10) given
```

### 2. Heterogeneous Arrays (`list<int|string>`, `(Dog|Cat)[]`, `array<string, mixed>`)
Elements within the same array can freely mix types as long as each element satisfies the union:

```php
/**
 * Heterogeneous collection: items can be an integer, string, or boolean
 *
 * @param list<int|string|bool> $mixedData
 */
function processHeterogeneous(array $mixedData): void {}

processHeterogeneous([10, 'hello', true, 42, false]); // Valid
processHeterogeneous([10, 'hello', new stdClass()]);  // Throws: TypeError: Argument $mixedData[2] must be of type (int | string | bool), stdClass given
```

---

## The Union Precedence Pitfall: `A[] | B[]` vs `(A | B)[]`

In formal type theory (PHPDoc, PHPStan, Psalm, TypeScript), the array bracket suffix `[]` has **higher operator precedence** than the union operator `|`.

| Type Syntax | Formal Interpretation | Validation Behavior |
| :--- | :--- | :--- |
| **`TypeA[] \| TypeB[]`** | `(Array<TypeA>) \| (Array<TypeB>)`<br>*(Homogeneous Union)* | The array must be **100% `TypeA`** OR **100% `TypeB`**. Mixed arrays containing both types are **strictly rejected**. |
| **`(TypeA \| TypeB)[]`**<br>or `array<TypeA \| TypeB>` | `Array<TypeA \| TypeB>`<br>*(Heterogeneous Array)* | The array may freely contain a **mix of `TypeA` and `TypeB`** elements. |

### Example: The Precedence Mistake

```php
use App\Models\User;
use App\Models\Admin;

/**
 * Homogeneous Union: Expects an array of ALL Users OR an array of ALL Admins
 *
 * @param User[]|Admin[] $accounts
 */
function processHomogeneousUnion(array $accounts): void {}

/**
 * Heterogeneous Array: Expects an array that can mix Users and Admins
 *
 * @param (User|Admin)[] $accounts
 */
function processHeterogeneousArray(array $accounts): void {}

$mixedAccounts = [new User('Alice'), new Admin('Bob')];

// 1. Fails Homogeneous Union check (contains both Users and Admins):
processHomogeneousUnion($mixedAccounts);
// Throws: TypeError: Argument $accounts[1] must be of type User, Admin given

// 2. Passes Heterogeneous Array check:
processHeterogeneousArray($mixedAccounts); // Valid
```

---

## Variadic Parameters & Array Contracts (`...$items`)

When PHP executes a variadic parameter (`function foo(Type ...$items)`), the Zend Engine collects all passed arguments into a sequential wrapper list (`$items = [0 => arg1, 1 => arg2, ...]`).

TypePHP automatically wraps and unpacks variadic DocBlock contracts:

### 1. Scalar & Object Variadics (`@param positive-int ...$ids`)

```php
/**
 * @param positive-int ...$ids
 */
function sumIds(int ...$ids): int
{
    return array_sum($ids);
}

sumIds(10, 20, 30); // Valid: [10, 20, 30]

sumIds(10, -5, 30);
// Throws: TypeError: Argument $ids[1] must be of type positive-int, negative int (-5) given
```

### 2. Variadic Generic Collections (`@param array<K, V> ...$arrays`)

When a variadic parameter accepts arrays (e.g. array helper operations like `diffKeys` or `merge`), each passed argument is an array. Inside PHP, `$arrays` is an array of arrays (`list<array<K, V>>`):

```php
/**
 * @template TKey of array-key
 * @template TValue
 *
 * @param array<TKey, TValue> $array
 * @param array<TKey, mixed> ...$arrays Each variadic argument is an array<TKey, mixed>
 *
 * @return array<TKey, TValue>
 */
function diffKeys(array $array, array ...$arrays): array
{
    return array_diff_key($array, ...$arrays);
}

$initial = ['first_name' => 'John', 'last_name' => 'Doe', 'age' => 42];

// Valid: Passed variadic arrays with matching TKey (string)
diffKeys($initial, ['age' => 10], ['last_name' => true]);

// Invalid: Variadic argument #2 has integer key 123 instead of string TKey
diffKeys($initial, [123 => 'value']);
// Throws: TypeError: Argument $arrays[0] key must be of type string, int (123) given
```

### 3. Homogeneous Variadic Templates (`@template T` with `@param T ...$items`)

When a function declares an unbounded generic template `@template T` on a variadic parameter `@param T ...$items`, **all variadic arguments in that call must be of the same type `T`**:

```php
/**
 * @template T
 *
 * @param T ...$items
 *
 * @return list<T>
 */
function collectSameType(mixed ...$items): array
{
    return array_values($items);
}

// 1. Valid: All variadic items are integers (T = int)
collectSameType(10, 20, 30); // Valid

// 2. Invalid: Inconsistent types (Item 0 is int, Item 2 is string)
collectSameType(10, 20, 'invalid');
// Throws: TypeError: Argument $items[2] (template T = int) must be of type int, string 'invalid' given
```

> **Template Bound Widening:** If the template declares an upper bound (e.g. `@template T of int|float`), TypePHP dynamically widens `T` to accommodate all arguments that satisfy the bound:
> ```php
> /**
>  * @template T of int|float
>  * @param T ...$numbers
>  * @return list<T>
>  */
> function sumAll(int|float ...$numbers): array {}
> 
> sumAll(1, 2.5, 3); // Valid: T is widened to int|float because both satisfy the bound
> ```

### 4. Heterogeneous Variadics (`mixed ...$values`)

If a function is designed to accept multiple arguments of **different types in the same call** (e.g. `append(1, 'b', ['a' => 'b'])`), declare the parameter as `mixed ...$values`:

```php
class Collection
{
    /**
     * Accepts arbitrary heterogeneous values in a single call
     *
     * @param mixed ...$values
     */
    public function append(mixed ...$values): self
    {
        // ...
        return $this;
    }
}

$col = new Collection();
$col->append(1, 'foo', ['nested' => 'array'], false); // Valid
```

---

## Deeply Nested Arrays & Lists (`array<K, list<V>>`)

TypePHP recursively validates deeply nested array structures down to any depth:

```php
/**
 * @param array<string, list<positive-int>> $matrix
 */
function processMatrix(array $matrix): void
{
    // ...
}

// 1. Valid Call
processMatrix([
    'math' => [100, 95],
    'science' => [88, 92],
]);

// 2. Invalid Call (Nested list item -50 violates positive-int)
processMatrix([
    'math' => [100, -50],
]);
// Throws: TypeError: processMatrix(): Argument $matrix['math'][1] must be of type positive-int, negative int (-50) given
```

---

## Array Shapes (`array{key: type}`)

Array shapes define exact key-value contracts for associative arrays.

### Required vs. Optional Keys

Mark optional keys with a question mark (`key?: type`):

```php
/**
 * @param array{id: positive-int, username: non-empty-string, role?: 'admin'|'user'} $payload
 */
function saveUserPayload(array $payload): void
{
    // ...
}

// 1. Valid Call (Optional 'role' key omitted)
saveUserPayload(['id' => 10, 'username' => 'Alice']);

// 2. Valid Call (Optional 'role' key provided)
saveUserPayload(['id' => 10, 'username' => 'Alice', 'role' => 'admin']);

// 3. Invalid Call (Missing required 'username' key)
saveUserPayload(['id' => 10]);
// Throws: TypeError: saveUserPayload(): Argument $payload is missing required key 'username'
```

### Sealed vs. Unsealed Shapes

By default, array shapes are **sealed**. Any unexpected extra keys in the array will trigger a `TypeError`.

To allow additional dynamic keys, define an **unsealed shape** using `...<K, V>` syntax:

```php
/**
 * Unsealed Shape: Requires 'id', but permits additional string-string pairs
 *
 * @param array{id: positive-int, ...<string, string>} $options
 */
function processUnsealedOptions(array $options): void
{
    // ...
}

// 1. Valid Call (Includes extra string key 'category')
processUnsealedOptions(['id' => 10, 'category' => 'admin']);

// 2. Invalid Call (Extra key 'code' has integer value 999 instead of string)
processUnsealedOptions(['id' => 10, 'code' => 999]);
// Throws: TypeError: processUnsealedOptions(): Argument $options['code'] must be of type string, int (999) given
```

### Array Shape Composition via Intersections (`ShapeA & ShapeB`)

TypePHP supports composing sealed and unsealed array shapes using intersection (`&`) operators. When shapes intersect, declared fields are merged into a single composite schema while preserving strict boundaries against unexpected keys:

```php
/**
 * @phpstan-type Identifiable array{id: positive-int, created_at: non-empty-string}
 * @phpstan-type Taggable     array{tags: list<non-empty-string>}
 * @phpstan-type ArticleShape Identifiable & Taggable
 *
 * @param ArticleShape $article
 */
function publishArticle(array $article): bool
{
    return true;
}

// 1. Valid Call (Contains all required fields from both schemas)
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-14',
    'tags' => ['php', 'typephp'],
]);

// 2. Invalid Call (Missing required key from Taggable schema)
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-14',
]);
// Throws: TypeError: publishArticle(): Argument $article is missing required key 'tags'

// 3. Invalid Call (Contains unexpected key not declared in either schema)
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-14',
    'tags' => ['php'],
    'unregistered_key' => true,
]);
// Throws: TypeError: publishArticle(): Argument $article contains unsealed unexpected key 'unregistered_key'
```

#### Overlapping Key Refinement
When intersected shapes declare the same key with different constraints, TypePHP unifies them into an intersected constraint (e.g., `score: int` and `score: positive-int` unifies to `score: int & positive-int`):

```php
/**
 * @param array{score: int, label: string} & array{score: positive-int} $payload
 */
function recordScore(array $payload): void
{
    // ...
}

recordScore(['score' => 50, 'label' => 'good']); // Valid

recordScore(['score' => -10, 'label' => 'bad']);
// Throws: TypeError: Argument $payload['score'] must be of type (int & positive-int), negative int (-10) given
```

---

## Positional Tuple Shapes (`array{0: T1, 1: T2}` & Keyless Tuples)

Define fixed-length, positional array tuples:

```php
/**
 * Positional Tuple with Optional Trailing Element
 *
 * @param array{0: positive-int, 1: non-empty-string, 2?: bool} $tuple
 */
function processTuple(array $tuple): void
{
    // ...
}

// 1. Valid Call (Optional index 2 omitted)
processTuple([100, 'success']);

// 2. Valid Call (Optional index 2 provided)
processTuple([100, 'success', true]);

// 3. Invalid Call (Index 0 is negative integer)
processTuple([-5, 'success']);
// Throws: TypeError: processTuple(): Argument $tuple['0'] must be of type positive-int, negative int (-5) given
```

### Implicit Keyless Tuple Syntax (`array{T1, T2}`)

TypePHP fully supports implicit keyless tuple syntax (e.g. `array{list<positive-int>, non-empty-string}`):

```php
/**
 * @param array{list<positive-int>, non-empty-string} $bundle
 */
function processBundle(array $bundle): void
{
    // ...
}

processBundle([[10, 20], 'bundle_tag']); // Valid
```

---

## Key & Value Extraction (`key-of<T>` & `value-of<T>`)

TypePHP supports dynamically restricting function parameters, return types, property writes, or array shape fields to the keys or values of an array constant, an array shape, or a PHP 8.1 Enum using `key-of<T>` and `value-of<T>` type operators.

> **Performance & Visibility:** TypePHP caches array and enum extractions in static memory, guaranteeing **$O(1)$ constant lookup times** during execution. Furthermore, it safely resolves `private` and `protected` class constants (e.g. `key-of<self::PRIVATE_MAP>`) without visibility violations.

| Annotation | Supported Targets `T` | Validation Rule |
| :--- | :--- | :--- |
| **`key-of<T>`** | Array Constant, Array Shape, UnitEnum, BackedEnum | Validates that the value matches a valid **array key**, shape key, or **Enum case name** (e.g. `'Active'`, `'Hearts'`). |
| **`value-of<T>`** | Array Constant, BackedEnum | Validates that the value matches a valid **array value** or **BackedEnum backing value** (e.g. `'active'`, `1`). |

---

### 1. Extracting from Class Constants

```php
namespace App\Database;

class DriverManager
{
    private const DRIVER_MAP = [
        'pdo_mysql'  => 'PDO\MySQL\Driver',
        'pdo_sqlite' => 'PDO\SQLite\Driver',
    ];

    /**
     * @param key-of<self::DRIVER_MAP> $driverKey
     * @param value-of<self::DRIVER_MAP> $driverClass
     */
    public function connect(string $driverKey, string $driverClass): void
    {
        // ...
    }
}

$manager = new DriverManager();

// Valid Call
$manager->connect('pdo_mysql', 'PDO\MySQL\Driver');

// Invalid Driver Key
$manager->connect('pdo_pgsql', 'PDO\MySQL\Driver');
// Throws: TypeError: Argument $driverKey must be a key of App\Database\DriverManager::DRIVER_MAP, string 'pdo_pgsql' given

// Invalid Driver Class Value
$manager->connect('pdo_mysql', 'PDO\PgSQL\Driver');
// Throws: TypeError: Argument $driverClass must be a value of App\Database\DriverManager::DRIVER_MAP, string 'PDO\PgSQL\Driver' given
```

---

### 2. Extracting from Enums (UnitEnums vs. BackedEnums)

* **UnitEnums (`enum Suit { case Hearts; case Spades; }`):**
  * `key-of<Suit>` validates case **names** (`'Hearts'`, `'Spades'`).
  * `value-of<Suit>` strictly rejects all values with a `TypeError` because pure UnitEnums possess no backing values.
* **BackedEnums (`enum Status: string { case Active = 'active'; }` or `enum Code: int`):**
  * `key-of<Status>` validates case **names** (`'Active'`).
  * `value-of<Status>` validates **backing values** (`'active'`).

```php
enum Suit
{
    case Hearts;
    case Spades;
}

enum StatusEnum: string
{
    case Active = 'active';
    case Pending = 'pending';
}

/**
 * @param key-of<Suit> $suitName          // Expects: 'Hearts' | 'Spades'
 * @param key-of<StatusEnum> $caseName    // Expects: 'Active' | 'Pending'
 * @param value-of<StatusEnum> $caseValue // Expects: 'active' | 'pending'
 */
function configureStatus(string $suitName, string $caseName, string $caseValue): void
{
    // ...
}

// 1. Valid Call
configureStatus('Hearts', 'Active', 'active');

// 2. Invalid Case Name (Passing lowercase 'active' where case name 'Active' was expected)
configureStatus('Hearts', 'active', 'active');
// Throws: TypeError: Argument $caseName must be a key of enum StatusEnum, string 'active' given

// 3. Invalid UnitEnum value-of usage (UnitEnums have no backing values)
function testBadUnitEnumValue(mixed $val): void {}
/** @param value-of<Suit> $val */
// Throws: TypeError: Argument $val must be a value of enum Suit
```

---

## Offset Access Types (`T[K]` & `T[K1][K2]`)

TypePHP supports evaluating offset access lookups on array shapes, constant arrays, and `@phpstan-type` aliases at runtime using `T[K]` and multi-level `T[K1][K2]` syntax.

> **AST Reduction:** TypePHP evaluates and reduces offset access lookups (e.g. `UserShape['id']` $\rightarrow$ `positive-int`) at the AST level before validation runs, executing type checks at **$O(1)$ constant speed**.

```php
namespace App\Services;

/**
 * @phpstan-type DatabaseConfig array{
 *     connection: array{
 *         port: int<1, 65535>,
 *         driver: 'mysql'|'pgsql'
 *     }
 * }
 */
class UserService
{
    public const CONFIG_MAP = [
        'mysql' => 'PDO\MySQL\Driver',
    ];

    /**
     * Resolves Multi-Level Offset DatabaseConfig['connection']['port'] -> int<1, 65535>
     * Resolves Constant Offset self::CONFIG_MAP['mysql'] -> literal 'PDO\MySQL\Driver'
     *
     * @param DatabaseConfig['connection']['port'] $port
     * @param self::CONFIG_MAP['mysql'] $driverClass
     */
    public function configure(int $port, string $driverClass): void
    {
        // ...
    }
}

$service = new UserService();

// 1. Valid Call
$service->configure(3306, 'PDO\MySQL\Driver');

// 2. Invalid Port (70000 exceeds int<1, 65535> extracted from nested offset)
$service->configure(70000, 'PDO\MySQL\Driver');
// Throws: TypeError: Argument $port must be <= 65535, int (70000) given

// 3. Invalid Driver Class ('PDO\PgSQL\Driver' violates literal 'PDO\MySQL\Driver')
$service->configure(3306, 'PDO\PgSQL\Driver');
// Throws: TypeError: Argument $driverClass must be literal 'PDO\MySQL\Driver', string 'PDO\PgSQL\Driver' given
```

---

## Object Shapes (`object{prop: type}` & `stdClass{prop: type}`)

Define property shape contracts for generic objects or strictly for `stdClass` instances:

### Generic Object Shapes (`object{prop: type}`)

Accepts any object instance or `stdClass` matching the declared property shape:

```php
/**
 * @param object{id: positive-int, name: non-empty-string, role?: string} $user
 */
function processObjectShape(object $user): void
{
    // ...
}

$std = new stdClass();
$std->id = 42;
$std->name = 'Alice';

processObjectShape($std); // Valid

class CustomUser { public int $id = 42; public string $name = 'Alice'; }
processObjectShape(new CustomUser()); // Valid
```

### Strict `stdClass` Shapes (`stdClass{prop: type}`)

Strictly requires a `\stdClass` instance, rejecting custom class instances:

```php
/**
 * @param stdClass{id: positive-int, name: non-empty-string} $payload
 */
function processStrictStdClass(object $payload): void
{
    // ...
}

class CustomUser { public int $id = 42; public string $name = 'Alice'; }

processStrictStdClass(new CustomUser());
// Throws: TypeError: processStrictStdClass(): Argument $payload must be an instance of stdClass, CustomUser given
```

### Deep Property Chains & Diagnostic Breadcrumbs (3+ Levels Deep)

TypePHP recursively evaluates deeply nested object and array shapes down to any depth, constructing accurate diagnostic breadcrumbs:

```php
/**
 * 4-level deep object shape
 *
 * @param object{company: object{department: object{lead: object{name: non-empty-string}}}} $user
 */
function assignLead(object $user): void
{
    // ...
}

// 1. Deep Field Error (Preserves complete property path)
$user = (object)[
    'company' => (object)[
        'department' => (object)[
            'lead' => (object)[
                'name' => '', // Fails non-empty-string!
            ],
        ],
    ],
];

assignLead($user);
// Throws: TypeError: assignLead(): Argument $user->company->department->lead->name must be of type non-empty-string, empty string ('') given

// 2. Deep Missing Property (Accurately identifies parent object)
$userMissingLead = (object)[
    'company' => (object)[
        'department' => (object)[
            // 'lead' is missing
        ],
    ],
];

assignLead($userMissingLead);
// Throws: TypeError: assignLead(): Argument $user->company->department is missing required property 'lead'

// 3. Deep Hybrid Object-Array Chains
/**
 * @param object{branches: list<object{manager: object{email: non-empty-string}}>} $org
 */
function notifyManagers(object $org): void { ... }

// Throws: TypeError: notifyManagers(): Argument $org->branches[1]->manager->email must be of type non-empty-string, empty string ('') given
```

### Safe Inspection of Uninitialized Readonly Properties

If an object instance contains uninitialized PHP 8.1+ `readonly` properties, TypePHP's `ObjectShapeValidator` safely inspects property initialization states using Reflection before attempting reads:

```php
class UserContainer
{
    public readonly int $id; // Uninitialized
}

/** @param object{id: positive-int} $obj */
function verifyContainer(object $obj): void { ... }

verifyContainer(new UserContainer());
// Throws: TypeError: verifyContainer(): Argument $obj property 'id' is uninitialized
```