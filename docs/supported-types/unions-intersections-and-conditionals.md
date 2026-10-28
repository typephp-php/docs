# Unions, Intersections, Variadics, and Conditionals

TypePHP provides rich runtime enforcement for complex type algebra, including Union (`|`) types, Intersection (`&`) types, Schema Composition, Variadic (`...$items`) parameters, and Conditional Types.

---

## Union Types (`A | B`)

Union types specify that a value must satisfy **at least one** of the declared type variants. TypePHP evaluates union variants sequentially from left to right.

### Scalar and Literal Value Unions

Combine scalar types, refinements, and literal string/integer values:

<TypePHPSnippet title="Scalar & Literal Value Unions" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int|non-empty-string|'active'|'pending' $value
 */
function processStatus(int|string $value): void
{
    echo "✓ Accepted valid union value: " . var_export($value, true) . "\n";
}

// 1. Happy Path: Satisfies positive-int, non-empty-string, or literal union members
processStatus(100);
processStatus('user_profile_tag');
processStatus('active');

// 2. Negative integer violates positive-int and literal members
try {
    processStatus(-50);
} catch (\TypeError $e) {
    echo "✗ Caught negative int failure:\n   " . $e->getMessage() . "\n";
}

// 3. Empty string violates non-empty-string and literal members
try {
    processStatus('');
} catch (\TypeError $e) {
    echo "✗ Caught empty string failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Tagged / Discriminated Unions & Smart Diagnostics

Discriminated unions (tagged unions) are the industry standard for handling varying API payloads, domain events, or state machine transitions based on a discriminator field (e.g. `'type'`, `'kind'`, `'status'`).

#### Discriminator-Aware Diagnostic Engine
In standard naive validators, when an incoming payload fails a union branch, the error message erroneously blames the first member in the union (e.g. *"must be literal 'click'"* even when you passed `'hover'`).

TypePHP features an intelligent **Discriminator-Aware Diagnostic Engine**:
1. **Targeted Branch Isolation:** When incoming data matches a discriminator tag (e.g. `'type' => 'hover'` or `$event->kind === 'refund'`), TypePHP isolates that specific branch and diagnoses the **exact failing field** within it.
2. **Support for Array & Object Shapes:** The engine scans discriminator fields across associative array keys (`$arr['type']`) as well as object properties (`$obj->kind` on `stdClass` or domain DTOs).
3. **Unrecognized Discriminator Fallback:** When incoming data contains an entirely unknown discriminator value, TypePHP falls back to reporting the full union contract.

<TypePHPSnippet title="Array Shape Tagged Union Diagnostics" default-view="source">

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
    echo "✓ Handled event '{$event['type']}'\n";
}

// 1. Happy Path: Valid event payloads
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'hover', 'element' => 'btn-submit']);
handleEvent(['type' => 'scroll', 'offset' => 150]);

echo "\n";

// 2. Targeted Branch Diagnostic:
// Discriminator 'type' => 'hover' is matched, so TypePHP isolates that branch
// and pinpoints the exact failing field 'element' (rather than blaming 'click')!
try {
    handleEvent(['type' => 'hover', 'element' => '']);
} catch (\TypeError $e) {
    echo "✗ Targeted discriminator failure:\n   " . $e->getMessage() . "\n\n";
}

// 3. Unrecognized Discriminator Fallback:
// 'type' => 'swipe' matches zero branches, reporting the full union contract:
try {
    handleEvent(['type' => 'swipe', 'distance' => 50]);
} catch (\TypeError $e) {
    echo "✗ Unrecognized discriminator fallback:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

#### Object Shape Discriminated Unions

The same discriminator isolation applies seamlessly to dynamic object structures and DTOs:

<TypePHPSnippet title="Object Shape Discriminated Unions" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param object{kind: 'payment', amount: positive-int, currency: 'USD'|'EUR'}
 *      | object{kind: 'refund', transaction_id: non-empty-string, reason: string} $payload
 */
function processTransaction(object $payload): void
{
    echo "✓ Processed transaction payload of kind '{$payload->kind}'\n";
}

// 1. Valid payment object
$payment = (object) [
    'kind' => 'payment',
    'amount' => 150,
    'currency' => 'USD',
];
processTransaction($payment);

// 2. Valid refund object
$refund = (object) [
    'kind' => 'refund',
    'transaction_id' => 'tx_987654',
    'reason' => 'Customer request',
];
processTransaction($refund);

echo "\n";

// 3. Failure on Matched Branch:
// 'kind' => 'payment' is recognized, pinpointing the invalid negative amount!
try {
    $badPayment = (object) [
        'kind' => 'payment',
        'amount' => -25, // Fails positive-int!
        'currency' => 'USD',
    ];
    processTransaction($badPayment);
} catch (\TypeError $e) {
    echo "✗ Targeted object discriminator error:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Intersection Types (`A & B`)

Intersection types require an object or value to satisfy **all** declared interface or shape contracts simultaneously.

> **Important Syntax Rules for Intersections:**
> 1. **Parentheses Requirement:** When combining intersections with unions or generic parameters (such as `(Countable & ArrayAccess) | (Iterator & Countable)` or `Collection<Countable & ArrayAccess>`), always enclose each intersection in parentheses.
> 2. **No Raw Unions Inside Intersections:** PHPDoc syntax rules require Disjunctive Normal Form (Unions of Intersections). Placing raw unions directly inside an intersection (such as `A & (B | C)`) is unsupported. Always expand and write it as a union of intersections: `(A & B) | (A & C)`.

### Interface Intersections

Enforce that an object implements multiple interfaces simultaneously. When an object fails an intersection check, TypePHP reports the complete intersection contract, perfectly matching PHP 8.1+ native error formatting:

<TypePHPSnippet title="Interface Intersections (Countable & ArrayAccess)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class CountableOnly implements Countable
{
    public function count(): int { return 0; }
}

/**
 * @param Countable&ArrayAccess $collection
 */
function processCollection(object $collection): void
{
    echo "✓ Verified intersection: " . get_class($collection) . " implements both interfaces\n";
}

// 1. Happy Path: ArrayObject implements both Countable and ArrayAccess
processCollection(new ArrayObject([1, 2, 3]));

// 2. Failure: CountableOnly implements Countable, but fails ArrayAccess!
try {
    processCollection(new CountableOnly());
} catch (\TypeError $e) {
    echo "✗ Intersection failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Array Shape Composition (`ShapeA & ShapeB`)

In modular architectures, developers frequently compose schemas using intersections. 

When you intersect multiple array shapes, TypePHP introduces **Schema Composition**:
* **Schema Merging:** All declared fields across both shapes are merged into a unified composite schema at runtime.
* **Overlapping Key Refinement:** When intersected shapes declare the same key with different constraints (e.g. `score: int` and `score: positive-int`), TypePHP unifies them into an intersected constraint (`score: int & positive-int`).
* **Sealed Integrity:** Extra unexpected keys that do not belong to either schema are strictly rejected.

<TypePHPSnippet title="Schema Composition (ShapeA & ShapeB)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @phpstan-type Identifiable array{id: positive-int, created_at: non-empty-string}
 * @phpstan-type Taggable     array{tags: list<non-empty-string>}
 * @phpstan-type ArticleShape Identifiable & Taggable
 *
 * @param ArticleShape $article
 */
function publishArticle(array $article): void
{
    echo "✓ Published Article #{$article['id']} with " . count($article['tags']) . " tag(s)\n";
}

// 1. Happy Path: Contains all required fields merged from both schemas
publishArticle([
    'id' => 101,
    'created_at' => '2026-10-27',
    'tags' => ['php', 'typephp', 'runtime'],
]);

// 2. Missing Required Key from Taggable schema ('tags')
try {
    publishArticle([
        'id' => 101,
        'created_at' => '2026-10-27',
    ]);
} catch (\TypeError $e) {
    echo "✗ Missing composed key:\n   " . $e->getMessage() . "\n";
}

// 3. Sealed Safety: Extra unexpected keys are strictly forbidden
try {
    publishArticle([
        'id' => 101,
        'created_at' => '2026-10-27',
        'tags' => ['release'],
        'unregistered_key' => true,
    ]);
} catch (\TypeError $e) {
    echo "✗ Unsealed unexpected key:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Unions of Intersections (Disjunctive Normal Form - DNF)

Combine intersection members with unions using parentheses:

<TypePHPSnippet title="Unions of Intersections (DNF)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param (Countable&ArrayAccess)|(Iterator&Countable) $payload
 */
function inspectAggregate(object $payload): void
{
    echo "✓ Accepted DNF structure: " . get_class($payload) . "\n";
}

// 1. Satisfies branch 1: Countable & ArrayAccess
inspectAggregate(new ArrayObject([1, 2]));

// 2. Satisfies branch 2: Iterator & Countable
inspectAggregate(new ArrayIterator([1, 2]));

// 3. Fails both branches: stdClass satisfies neither branch
try {
    inspectAggregate(new stdClass());
} catch (\TypeError $e) {
    echo "✗ Failed all DNF branches:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Variadic Parameter Contracts (`...$items`)

When a function parameter uses PHP's variadic syntax (`...$items`), TypePHP validates **every individual argument** passed in the variadic argument list:

<TypePHPSnippet title="Variadic Parameter Contracts" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int ...$ids
 */
function deleteBatch(int ...$ids): void
{
    echo "✓ Deleted " . count($ids) . " records\n";
}

/**
 * @param array{id: positive-int, role: 'admin'|'user'} ...$users
 */
function registerBatch(array ...$users): void
{
    echo "✓ Registered " . count($users) . " user shapes\n";
}

// 1. Valid Variadic Calls
deleteBatch(10, 20, 30);
registerBatch(
    ['id' => 1, 'role' => 'admin'],
    ['id' => 2, 'role' => 'user']
);

echo "\n";

// 2. Scalar Variadic Failure: 3rd item violates positive-int
try {
    deleteBatch(10, 20, -5);
} catch (\TypeError $e) {
    echo "✗ Variadic scalar failure:\n   " . $e->getMessage() . "\n";
}

// 3. Shape Variadic Failure: 2nd item has invalid role 'superadmin'
try {
    registerBatch(
        ['id' => 1, 'role' => 'admin'],
        ['id' => 2, 'role' => 'superadmin']
    );
} catch (\TypeError $e) {
    echo "✗ Variadic shape failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Conditional Types & Recursive Evaluation

Conditional types allow you to dynamically alter parameter and return contracts based on the value of incoming parameters or bound generic templates.

TypePHP provides full support for **nested and recursive conditional types**, allowing you to construct multi-level decision trees, chained ternary expressions, and negated conditions (`is not`):

$$\text{Syntax: } \mathbf{(\$param \text{ is } Target \text{ ? } (\dots \text{ ? } A \text{ : } B) \text{ : } C)}$$

---

### Nested & Chained Conditional Parameters

You can nest conditional expressions to inspect multiple parameters in sequence:

<TypePHPSnippet title="Nested & Recursive Conditional Parameters" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Multi-level decision tree:
 * - If $format is 'json' and $compressed is true: string (base64 gzip)
 * - If $format is 'json' and $compressed is false: array<string, mixed>
 * - If $format is 'xml': non-empty-string
 *
 * @param 'json'|'xml' $format
 * @param bool $compressed
 * @param ($format is 'json'
 *     ? ($compressed is true ? non-empty-string : array<string, mixed>)
 *     : non-empty-string
 * ) $payload
 */
function transmit(string $format, bool $compressed, mixed $payload): void
{
    echo "✓ Payload transmitted for format '{$format}' (compressed=" . ($compressed ? 'true' : 'false') . ")\n";
}

// 1. Format 'json' + uncompressed -> requires array
transmit('json', false, ['status' => 'ok', 'code' => 200]);

// 2. Format 'json' + compressed -> requires string
transmit('json', true, 'H4sICAAAAAAC/6tWKi5NTflqBgDCk...==');

// 3. Format 'xml' -> requires non-empty-string
transmit('xml', false, '<response>ok</response>');

echo "\n";

// 4. Nested Branch Violation:
// $format is 'json' and $compressed is false, but string was given instead of array!
try {
    transmit('json', false, '{"status":"ok"}');
} catch (\TypeError $e) {
    echo "✗ Nested condition failure:\n   " . $e->getMessage() . "\n";
}

// 5. Negated Condition Support ($format is not 'json'):
/**
 * @param 'json'|'raw' $mode
 * @param ($mode is not 'json' ? int : array<string, mixed>) $data
 */
function handleData(string $mode, mixed $data): void {}

handleData('raw', 100); // Valid

try {
    handleData('raw', ['not' => 'int']);
} catch (\TypeError $e) {
    echo "✗ Negated condition failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Template-Based Conditional Parameters

You can also construct conditional parameter contracts based on the runtime inferred type of a generic template `T`:

<TypePHPSnippet title="Template-Based Conditional Parameters (T is Target ? A : B)" default-view="source">

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
function processAnimal(Animal $animal, mixed $output): void
{
    echo "✓ Processed " . get_class($animal) . " output cleanly\n";
}

$dog = new Dog();
$cat = new Cat();

// 1. T is inferred as Dog -> $output must be list<Dog>
processAnimal($dog, [$dog, new Dog()]);

// 2. T is inferred as Cat -> $output must be Cat
processAnimal($cat, $cat);

// 3. Failure: Passing single Dog when list<Dog> is required for T = Dog
try {
    processAnimal($dog, $dog);
} catch (\TypeError $e) {
    echo "✗ Caught template condition violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Parameter-Based Conditional Returns

Just like parameters, return contracts can conditionally resolve based on incoming parameter values:

<TypePHPSnippet title="Parameter-Based Conditional Returns" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * If $asInt is true, returns positive-int; otherwise non-empty-string.
 *
 * @param bool $asInt
 * @param mixed $value
 * @return ($asInt is true ? positive-int : non-empty-string)
 */
function formatValue(bool $asInt, mixed $value): mixed
{
    return $value;
}

// 1. $asInt = true resolves return contract to positive-int
$intVal = formatValue(true, 42);
echo "✓ Integer branch verified: {$intVal}\n";

// 2. $asInt = false resolves return contract to non-empty-string
$strVal = formatValue(false, 'active_status');
echo "✓ String branch verified: {$strVal}\n\n";

// 3. Failure: $asInt is true, but function returns a string!
try {
    formatValue(true, 'not_an_int');
} catch (\TypeError $e) {
    echo "✗ Return condition violation (asInt = true):\n   " . $e->getMessage() . "\n";
}

// 4. Failure: $asInt is false, but function returns an empty string!
try {
    formatValue(false, '');
} catch (\TypeError $e) {
    echo "✗ Return condition violation (asInt = false):\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Nested & Recursive Conditional Returns

Return types can also form recursive and nested decision trees. In `ConditionalChecker`, TypePHP unwraps nested ternary AST nodes recursively until a concrete terminal type is reached:

<TypePHPSnippet title="Nested Recursive Conditional Returns" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Nested return decision tree based on two flags:
 *
 * @param 'int'|'string'|'bool' $type
 * @param bool $nullable
 * @param mixed $value
 * @return ($type is 'int'
 *     ? ($nullable is true ? int|null : int)
 *     : ($type is 'string' ? string : bool)
 * )
 */
function castValue(string $type, bool $nullable, mixed $value): mixed
{
    return $value;
}

// 1. type='int', nullable=true -> int|null
$val1 = castValue('int', true, null);
echo "✓ Nested int|null branch verified: " . var_export($val1, true) . "\n";

// 2. type='int', nullable=false -> strict int
$val2 = castValue('int', false, 42);
echo "✓ Strict int branch verified: {$val2}\n";

// 3. type='string' -> strict string
$val3 = castValue('string', false, 'hello');
echo "✓ String branch verified: '{$val3}'\n\n";

// 4. Violation: type='int' with nullable=false, but null was returned!
try {
    castValue('int', false, null);
} catch (\TypeError $e) {
    echo "✗ Caught nested return failure (non-nullable int):\n   " . $e->getMessage() . "\n";
}

// 5. Violation: type='string', but integer was returned!
try {
    castValue('string', false, 12345);
} catch (\TypeError $e) {
    echo "✗ Caught nested return failure (expected string):\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Template-Based Conditional Decision Trees

Conditional logic can also be chained against inferred generic template parameters `T`:

<TypePHPSnippet title="Chained Generic Template Conditionals" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Dog {}
class Cat {}
class Bird {}

/**
 * Multi-branch template resolution:
 * - If T is Dog  => positive-int
 * - If T is Cat  => non-empty-string
 * - Else         => bool
 *
 * @template T
 * @param T $pet
 * @param mixed $result
 * @return (T is Dog
 *     ? positive-int
 *     : (T is Cat ? non-empty-string : bool)
 * )
 */
function dispatchByPetType(object $pet, mixed $result): mixed
{
    return $result;
}

// 1. T is Dog => positive-int
$resDog = dispatchByPetType(new Dog(), 100);
echo "✓ Dog branch: {$resDog}\n";

// 2. T is Cat => non-empty-string
$resCat = dispatchByPetType(new Cat(), 'feline_ok');
echo "✓ Cat branch: {$resCat}\n";

// 3. T is Bird (fallback) => bool
$resBird = dispatchByPetType(new Bird(), true);
echo "✓ Fallback Bird branch: " . ($resBird ? 'true' : 'false') . "\n\n";

// 4. Failure: T is Cat, but returning empty string!
try {
    dispatchByPetType(new Cat(), '');
} catch (\TypeError $e) {
    echo "✗ Cat branch violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>