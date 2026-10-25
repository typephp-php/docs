# By-Reference Contracts & Mutations

In standard PHP, references (`&`) create Zend Engine `zval` aliases (`IS_REFERENCE`). Historically, references have been the single most common loophole in dynamic validation systems: once a reference is created, modifying the alias bypasses standard variable assignment interceptors.

TypePHP provides **full-spectrum reference protection across all reference boundaries**: parameter inputs, out-parameter post-conditions, variable-to-variable aliasing, object property references, array element references, by-reference `foreach` loops, and signature-aware callable reference dispatching.

---

## Parameter Input Contracts (`function update(int &$param)`)

When a function or method parameter is passed by reference, TypePHP enforces pre-conditions **on function entry** before any code in the function body executes.

### Why Entry Validation Matters

If an invalid argument is passed into a by-reference parameter, throwing `TypeError` immediately guarantees that the caller's variable in the outer scope **remains 100% un-mutated and un-corrupted**:

<TypePHPSnippet title="By-Reference Parameter Entry Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int &$score
 * @param non-empty-string &$username
 */
function applyBonus(int &$score, string &$username): void
{
    $score += 50;
    $username = strtoupper($username);
}

// 1. Valid Call: Mutated in-place in caller scope
$userScore = 100;
$userName = 'alice';
applyBonus($userScore, $userName);

echo "Score: {$userScore}\n"; // 150
echo "Name: {$userName}\n\n";  // 'ALICE'

// 2. Invalid Call: -10 violates positive-int on entry!
$invalidScore = -10;
$userTag = 'alice';

echo "Attempting to pass invalid score -10...\n";
applyBonus($invalidScore, $userTag);
```

</TypePHPSnippet>

### DocBlock Syntax Flexibility (`&$param` vs. `$param`)

You can write your DocBlock annotations with or without the leading ampersand (`&`). Both are recognized identically by TypePHP's parser:

```php:line-numbers
// Option A: Explicit ampersand in DocBlock (Recommended)
/**
 * @param positive-int &$count
 */
function incrementCount(int &$count): void { $count++; }

// Option B: Ampersand in native PHP signature only (Fully supported)
/**
 * @param positive-int $count
 */
function incrementCount(int &$count): void { $count++; }
```

---

## By-Reference Out-Parameter Contracts (`@param-out`)

While `@param` enforces pre-conditions on function entry, **`@param-out`** (and `@phpstan-param-out` / `@psalm-param-out`) enforces **post-conditions on function exit**.

When a function mutates a by-reference variable, TypePHP validates the variable's value right before the function returns or exits.

<TypePHPSnippet title="Out-Parameter Post-Condition (@param-out)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * On entry: $value can be anything (mixed)
 * On exit:  $value is guaranteed to be a positive integer
 *
 * @param mixed &$value
 * @param-out positive-int $value
 */
function initializeIdentifier(mixed &$value): void
{
    $value = 42; // Valid mutation
}

$id = null;
initializeIdentifier($id);
echo "✓ Initialized ID: {$id}\n\n";

/**
 * Failing Out-Parameter Example
 *
 * @param mixed &$value
 * @param-out positive-int $value
 */
function badInitialize(mixed &$value): void
{
    $value = -50; // Invalid: Violates positive-int!
}

$code = 'init';
echo "Calling badInitialize() which returns -50...\n";
badInitialize($code);
```

</TypePHPSnippet>

### Full Type Algebra Support in `@param-out`

`@param-out` supports all advanced types available in TypePHP:
* **Refinements:** `@param-out non-empty-string $token`
* **Array Shapes:** `@param-out array{id: positive-int, token: non-empty-string} $payload`
* **Unions & Intersections:** `@param-out ('active'|'pending') $status`, `@param-out (Countable & ArrayAccess) $collection`
* **Generic Templates:** `@param-out T $output`

### Disabling Out-Parameter Checks Independently

You can independently enable or disable `@param-out` enforcement using the `'params_out'` configuration key in `typephp.php`:

```php:line-numbers
// typephp.php
return [
    'params'     => true, // Enforces @param on entry
    'returns'    => true, // Enforces @return
    'params_out' => true, // Set to false to disable @param-out exit validation
];
```

---

## Variable-to-Variable Aliasing (`$alias =& $original`)

When a variable is assigned by reference to another typed variable (`$alias =& $original`), TypePHP inspects the RHS via `handleAssignRef` and **propagates the type contract into the new alias**:

<TypePHPSnippet title="By-Reference Variable Aliasing" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int $originalScore */
$originalScore = 100;

// $alias receives reference to $originalScore
$alias =& $originalScore;

// Valid mutation via alias
$alias += 50;
echo "✓ Score via alias: {$originalScore}\n\n"; // 150

// Invalid mutation: mutating $alias enforces positive-int on the underlying zval!
echo "Assigning negative score via alias...\n";
$alias = -25;
```

</TypePHPSnippet>

### Unregistration on Opaque Reference Assignment

If an alias is rebound by reference to an unconstrained or dynamic source:

```php:line-numbers
$opaqueSource = getExternalValue();
$alias =& $opaqueSource;
```

TypePHP detects the un-typed RHS and safely unregisters old static constraints on `$alias`, preventing false-positive errors while keeping `$originalScore` protected.

---

## By-Reference Object Property Aliasing (`$ref =& $obj->prop`)

A common bypass in legacy frameworks is aliasing an object's typed property to a local reference and modifying it:

```php:line-numbers
$balanceRef =& $account->balance;
$balanceRef = -500; // Bypasses standard property setter!
```

TypePHP tracks `Node\Expr\AssignRef` nodes on both `$node->var` and `$node->expr` via `markWriteContext` and `MemberAssignChecker`. When an object property is aliased, TypePHP monitors the underlying accessor chain:

<TypePHPSnippet title="By-Reference Property Aliasing" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Account
{
    /** @var positive-int */
    public int $balance = 100;
}

$account = new Account();

// Create local reference to object property
$ref =& $account->balance;

$ref += 50; // Valid: $account->balance is now 150
echo "✓ Balance after valid alias mutation: {$account->balance}\n\n";

// Mutating alias violates @var positive-int on Account::$balance!
echo "Assigning invalid balance via reference alias...\n";
$ref = -200;
```

</TypePHPSnippet>

---

## Array Element & Member-Chain References (`$ref =& $items[$key]`)

When a reference points directly into a nested array dimension or shape member:

```php:line-numbers
/** @var array{user: array{id: positive-int, score: positive-int}} $data */
$userScore =& $data['user']['score'];
```

`ContractVisitor::extractMemberChain` unpacks the root and dimension chain. When `$userScore` is modified, TypePHP evaluates the prospective mutation against the root container's shape contract:

<TypePHPSnippet title="Array Dimension Reference Mutation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var array{config: array{timeout: int<1, 60>}} $settings */
$settings = [
    'config' => [
        'timeout' => 30,
    ],
];

// Alias nested dimension to reference
$timeoutRef =& $settings['config']['timeout'];

$timeoutRef = 45; // Valid (within int<1, 60>)
echo "✓ Timeout updated: {$settings['config']['timeout']}\n\n";

// Violates int<1, 60> max bound of 60!
echo "Assigning timeout 120 via reference...\n";
$timeoutRef = 120;
```

</TypePHPSnippet>

---

## By-Reference `foreach` Loops (`foreach ($items as &$item)`)

When iterating over an array or list by reference (`foreach ($scores as &$score)`), modifications to `&$score` mutate the array elements in place.

### The Problem in Standard PHP

If a collection is annotated with `/** @var list<positive-int> $scores */`, mutating elements inside a by-reference loop can quietly corrupt the container without triggering standard assignment checks:

```php:line-numbers
foreach ($scores as &$score) {
    $score = -50; // Corrupts list<positive-int>!
}
```

### The Solution: Loop Boundary Post-Assertions

When TypePHP encounters a by-reference loop (`$node->byRef === true`), `ContractVisitor::createForeachBoundaryCheck` injects an assertion immediately following the loop:

<TypePHPSnippet title="By-Reference Foreach Boundary Guard" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var list<positive-int> $scores */
$scores = [10, 20, 30];

echo "Updating scores by reference in foreach loop...\n";

// Iterating and modifying elements in-place:
foreach ($scores as &$score) {
    if ($score === 20) {
        $score = -999; // Corrupts positive-int constraint!
    }
}
unset($score); // Standard PHP reference hygiene

echo "This line will never be reached due to loop post-boundary check!\n";
```

</TypePHPSnippet>

### Compile-Time Optimization Synergy (`isLoopBodyFreeOfOpaqueMutations`)

If TypePHP analyzes the loop body during AST transformation and determines that:
1. The loop contains no closures, opaque function calls, or external references.
2. All arithmetic or scalar operations inside the loop are mathematically proven safe (e.g. `$score += 5` on `positive-int`).

Then `createForeachBoundaryCheck` **completely omits the post-loop assertion at compile time**, allowing safe by-reference loops to execute at **100% native PHP C-speed**!

---

## Signature-Aware Callable Reference Dispatching

When passing callbacks that take arguments by reference (e.g. `callable(positive-int &$val): void`), standard wrapper closures often trigger PHP engine notices or break reference passing.

TypePHP's `CallableWrapper` analyzes the exact by-reference pattern of the callable signature:

| Declared Pattern | Dispatcher Signature | Supported Use Cases |
| :--- | :--- | :--- |
| `[true]` | `function (mixed &$a = null)` | Single by-ref argument |
| `[true, false]` | `function (mixed &$a = null, mixed $b = null)` | `array_walk` (item by-ref, key by-value) |
| `[false, true]` | `function (mixed $a = null, mixed &$b = null)` | Secondary by-ref argument |
| `[true, true]` | `function (mixed &$a = null, mixed &$b = null)` | Dual by-ref argument |
| Variadic `&...` | `function (&...$args)` | Arbitrary multi-argument mutations |

### Native `array_walk()` Example

`CallableWrapper` transparently supports `array_walk()` by-reference signatures without generating reference notices:

<TypePHPSnippet title="Callable By-Reference Mutation with array_walk" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param callable(positive-int &$item, array-key $key): void $callback
 * @param list<positive-int> &$items
 */
function transformList(callable $callback, array &$items): void
{
    array_walk($items, $callback);
}

$numbers = [1, 2, 3, 4];

// Valid in-place mutation: multiplies each positive-int by 10
transformList(function (int &$item, mixed $key): void {
    $item *= 10;
}, $numbers);

echo "✓ Transformed List: " . implode(', ', $numbers) . "\n\n";

// Invalid in-place mutation: setting an item to -50 triggers TypeError!
echo "Attempting to assign negative value inside callback...\n";
transformList(function (int &$item, mixed $key): void {
    if ($key === 2) {
        $item = -50;
    }
}, $numbers);
```

</TypePHPSnippet>
