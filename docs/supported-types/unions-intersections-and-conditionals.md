# Unions, Intersections, Variadics, and Conditionals

TypePHP provides rich runtime enforcement for complex type algebra, including Union (`|`) types, Intersection (`&`) types, Schema Composition, Variadic (`...$items`) parameters, and Conditional Return Types.

---

## Union Types (`A | B`)

Union types specify that a value must satisfy **at least one** of the declared type variants. TypePHP evaluates union variants sequentially from left to right.

### Scalar and Literal Value Unions

Combine scalar types, refinements, and literal string/integer values:

```php
<?php

declare(strict_types=1);

/**
 * @param positive-int|non-empty-string|'active'|'pending' $value
 */
function processStatus(int|string $value): void
{
    // Valid for 100, 'user_100', 'active', or 'pending'
}

// Valid Calls
processStatus(100);
processStatus('active');

// Invalid Call (-50 is a negative integer; 'archived' is not in the literal union)
processStatus(-50);
// Throws: TypeError: processStatus(): Argument $value must be of type (positive-int | non-empty-string | 'active' | 'pending'), negative int (-50) given
```

### Tagged / Discriminated Union Array and Object Shapes

Define discriminated unions for API responses, domain events, or state machines based on a discriminator tag (e.g., `type`, `status`, `kind`):

```php
/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void
{
    // ...
}

// Valid Calls
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'hover', 'element' => 'btn-submit']);
handleEvent(['type' => 'scroll', 'offset' => 150]);
```

#### Discriminator-Aware Diagnostic Engine
TypePHP includes an intelligent discriminator resolution engine:
1. **Targeted Branch Isolation:** When incoming data matches a discriminator tag (e.g., `'type' => 'hover'`), TypePHP isolates and diagnoses the exact failing field within that specific branch:
   ```php
   handleEvent([
       'type' => 'hover',
       'element' => '', // Fails non-empty-string!
   ]);
   // Throws: TypeError: handleEvent(): Argument $event['element'] must be of type non-empty-string, empty string ('') given
   ```
   *(TypePHP will not falsely claim that `type` must be `'click'` simply because `'click'` was listed first in the DocBlock).*

2. **Unrecognized Discriminator Fallback:** When incoming data contains an unrecognized discriminator value, TypePHP falls back to reporting the full union contract:
   ```php
   handleEvent([
       'type' => 'custom_unknown',
       'data' => 123,
   ]);
   // Throws: TypeError: handleEvent(): Argument $event must be of type (array{type: 'click', x: int, y: int} | array{type: 'hover', element: non-empty-string} | array{type: 'scroll', offset: positive-int}), associative array (key 'type') given
   ```

---

## Intersection Types (`A & B`)

Intersection types require an object or value to satisfy **all** declared interface or shape contracts simultaneously.

> **Important Syntax Rules for Intersections:**
> 1. **Parentheses Requirement:** When combining intersections with unions or generic parameters (such as `(Countable & ArrayAccess) | (Iterator & Countable)` or `Collection<Countable & ArrayAccess>`), always enclose each intersection in parentheses.
> 2. **No Raw Unions Inside Intersections:** PHPDoc syntax rules require Disjunctive Normal Form (Unions of Intersections). Placing raw unions directly inside an intersection (such as `A & (B | C)`) is unsupported. Always expand and write it as a union of intersections: `(A & B) | (A & C)`.

### Interface Intersections

Enforce that an object implements multiple interfaces simultaneously. Shallow failures report the complete intersection contract matching PHP 8.1+ native behavior:

```php
/**
 * @param Countable&ArrayAccess $collection
 */
function processCollection(object $collection): void
{
    // ...
}

// Valid Call (Implements both Countable and ArrayAccess)
processCollection(new ArrayObject([1, 2, 3]));

// Invalid Call (Implements Countable only)
class CountableOnly implements Countable { public function count(): int { return 0; } }

processCollection(new CountableOnly());
// Throws: TypeError: processCollection(): Argument $collection must be of type (Countable & ArrayAccess), CountableOnly given
```

### Array Shape Composition (`ShapeA & ShapeB`)

TypePHP supports schema composition by intersecting multiple sealed array shapes. Declared fields are merged into a single composite schema while preserving strict boundaries against unexpected keys:

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

// Valid Call (Contains all required fields from both schemas)
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-14',
    'tags' => ['php', 'typephp'],
]);

// Invalid Call (Missing required key from Taggable schema)
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-14',
]);
// Throws: TypeError: publishArticle(): Argument $article is missing required key 'tags'

// Invalid Call (Contains unexpected key not declared in either schema)
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
function recordScore(array $payload): void { ... }

recordScore(['score' => 50, 'label' => 'good']); // Valid
recordScore(['score' => -10, 'label' => 'bad']); // Throws: Argument $payload['score'] must be of type (int & positive-int)
```

### Unions of Intersections (Disjunctive Normal Form - DNF)

Combine intersection members with unions using parentheses:

```php
/**
 * Enclose each intersection member in parentheses
 *
 * @param (Countable&ArrayAccess)|(Iterator&Countable) $payload
 */
function processPayload(object $payload): void
{
    // ...
}

// Valid Calls
processPayload(new ArrayObject([1, 2]));   // Satisfies Countable & ArrayAccess
processPayload(new ArrayIterator([1, 2])); // Satisfies Iterator & Countable
```

---

## Variadic Parameter Contracts (`...$items`)

When a function parameter uses PHP's variadic syntax (`...$items`), TypePHP validates **every individual argument** passed in the variadic argument list.

### Scalar Variadics

```php
/**
 * @param positive-int ...$ids
 */
function deleteBatch(int ...$ids): void
{
    // ...
}

// Valid Call
deleteBatch(10, 20, 30);

// Invalid Call (3rd item violates positive-int)
deleteBatch(10, 20, -5);
// Throws: TypeError: deleteBatch(): Argument $ids[2] must be of type positive-int, negative int (-5) given
```

### Variadic Unions and Shapes

Combine variadic parameters with unions or array shapes:

```php
/**
 * Variadic Union
 *
 * @param (Dog|Cat) ...$animals
 */
function processAnimals(Animal ...$animals): void {}

// Variadic Array Shapes
/**
 * @param array{id: positive-int, username: non-empty-string} ...$users
 */
function processUsers(array ...$users): void {}

processUsers(
    ['id' => 1, 'username' => 'Alice'],
    ['id' => 2, 'username' => 'Bob']
); // Valid

processUsers(
    ['id' => 1, 'username' => 'Alice'],
    ['id' => -5, 'username' => 'Bob'] // Invalid: id is negative
);
// Throws: TypeError: processUsers(): Argument $users[1]['id'] must be of type positive-int, negative int (-5) given
```

---

## Conditional Return Types

Conditional return types dynamically select a function's return contract based on incoming parameter values or bound template types.

### Parameter-Based Conditional Return Types

Use `@return ($param is TargetType ? ReturnA : ReturnB)` to evaluate return contracts based on a parameter's value:

```php
/**
 * @param bool $asInt
 * @param mixed $value
 * @return ($asInt is true ? positive-int : non-empty-string)
 */
function formatValue(bool $asInt, mixed $value): mixed
{
    return $value;
}

// Evaluates return contract as positive-int
formatValue(true, 42); // Valid

formatValue(true, 'not_an_int');
// Throws: TypeError: formatValue(): Return value must be of type positive-int, string 'not_an_int' returned

// Evaluates return contract as non-empty-string
formatValue(false, 'hello'); // Valid

formatValue(false, '');
// Throws: TypeError: formatValue(): Return value must be of type non-empty-string, empty string ('') returned
```

### Template-Based Conditional Return Types

Use `@return (T is TargetType ? ReturnA : ReturnB)` to evaluate return contracts based on an inferred template parameter `T`:

```php
/**
 * @template T
 *
 * @param T $input
 * @param mixed $value
 * @return (T is string ? positive-int : bool)
 */
function evaluateByTemplate(mixed $input, mixed $value): mixed
{
    return $value;
}

// T is inferred as string -> Return contract becomes positive-int
evaluateByTemplate('input_string', 100); // Valid

evaluateByTemplate('input_string', 'invalid_return');
// Throws: TypeError: evaluateByTemplate(): Return value must be of type positive-int, string 'invalid_return' returned

// T is inferred as int -> Return contract becomes bool
evaluateByTemplate(12345, true); // Valid

evaluateByTemplate(12345, 'not_a_bool');
// Throws: TypeError: evaluateByTemplate(): Return value must be of type bool, string 'not_a_bool' returned
```