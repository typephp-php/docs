# Inline Variables (`@var`)

While parameter and return contracts protect function boundaries, inline `@var` annotations enforce type safety on local variable assignments, reassignments, compound operations, and direct return statements inside function bodies or PHP scripts.

---

## Basic Variable Validation

When you write an inline `@var` docblock above a local variable assignment, TypePHP validates the assigned value before the assignment executes:

<TypePHPSnippet title="Basic Variable Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

// TypePHP infers the target variable name ($age) automatically!
/** @var positive-int */
$age = 25; 
echo "✓ Age initialized: {$age}\n\n";

echo "Attempting to assign negative integer...\n";
$age = -10; 
```

</TypePHPSnippet>

TypePHP validates all supported type categories on inline variable assignments:
* **Scalars:** `positive-int`, `non-empty-string`, `numeric-string`, `truthy`
* **Arrays & Shapes:** `array{id: int, name: string}`, `list<positive-int>`, `int[]`
* **Objects:** `/** @var \App\Models\User */`
* **Unions & Intersections:** `positive-int|non-empty-string`, `Countable&ArrayAccess`
* **Generics:** `/** @var Collection<User> */`
* **Callables:** `/** @var callable(positive-int): non-empty-string */`

---

## Clean, DRY Syntax (Unnamed `@var`)

In standard PHPDoc, developers often repeat the variable name: `/** @var Type $myVar */`. 
With TypePHP, **you do not have to repeat the variable name**. The AST parser automatically infers the target variable directly from the assignment statement beneath it.

This keeps your code **DRY (Don't Repeat Yourself)** and ensures your DocBlocks never get out of sync when you rename variables during refactoring.

It is highly recommended to use a multi-line DocBlock for this when dealing with long variable names or complex array shapes to keep your code beautifully readable:

```php:line-numbers
// Single-line clean syntax
/** @var non-empty-string */
$title = 'Hello';

// Multi-line clean syntax (Great for long variable names or complex shapes!)
/**
 * @var array{
 *     id: positive-int, 
 *     name: non-empty-string
 * }
 */
$userRegistrationPayloadData = [
    'id' => 42,
    'name' => 'Alice'
];
```

---

## Compound Assignments & Increment/Decrement

TypePHP automatically tracks and validates inline `@var` types when variables or object properties are modified using compound assignment operators (`*=`, `+=`, `-=`, `/=`, `%=`, `.=`, `**=`, etc.) or increment/decrement operators (`++`, `--`):

<TypePHPSnippet title="Compound Assignments & Increments" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int */
$score = 10;

$score += 5; // Valid (15)
echo "✓ Score after addition: {$score}\n\n";

// Compound multiplication produces -30, violating positive-int!
echo "Multiplying score by -2...\n";
$score *= -2; 
```

</TypePHPSnippet>

This applies identically to class properties and static properties:
```php:line-numbers
class GameSession
{
    /** @var positive-int */
    public int $score = 10;

    public function penalty(): void
    {
        $this->score *= -1;
        // Throws: TypeError: Property GameSession::$score must be of type positive-int
    }
}
```

---

## Array Destructuring & Shape Propagation

TypePHP seamlessly integrates with PHP's `list()` and `[$a, $b]` destructuring syntax. 

Even better, if the source variable is annotated with an **Array Shape**, TypePHP **automatically propagates the shape's field types to the newly destructured local variables** in $O(1)$ time!

<TypePHPSnippet title="Shape Propagation on Destructuring" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var array{id: positive-int, username: non-empty-string} */
$payload = [
    'id' => 42,
    'username' => 'Alice',
];

// Destructure the array shape into local variables
['id' => $userId, 'username' => $userName] = $payload;
echo "✓ Destructured User #{$userId}: {$userName}\n\n";

// TypePHP AUTOMATICALLY knows that $userId is a positive-int!
echo "Attempting to assign negative value to destructured \$userId...\n";
$userId = -5;
```

</TypePHPSnippet>

### Explicit Multi-Variable Annotations
If you are destructuring an untyped array and want to explicitly annotate the resulting variables, you can declare all `@var` tags inside a single multi-line docblock:

```php:line-numbers
/**
 * @var positive-int $id
 * @var non-empty-string $username
 */
[$id, $username] = [42, 'Alice']; // Valid

[$id, $username] = [-5, 'Alice'];
// Throws: TypeError: Variable $id must be of type positive-int
```

---

## Inline `@var` on Direct Return Statements

You can place `/** @var Type */` directly above a `return` statement to perform surgical, expression-level type assertion narrowing inside function bodies, closures, or specific conditional branches:

<TypePHPSnippet title="Inline @var on Return Statements" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

function fetchScores(): array
{
    // Narrowing the return type dynamically right at the return statement!
    /** @var list<positive-int> */
    return [10, -5, 30]; 
}

echo "Fetching scores...\n";
fetchScores();
```

</TypePHPSnippet>

> **PHPStan & Psalm Parity:** Static analysis tools treat `/** @var Type */ return $expr;` as an inline type cast assertion. TypePHP physically enforces this assertion at runtime, ensuring that live dynamic returns strictly satisfy the annotated type before they exit the function.

---

## Block-Level Scope Isolation & Shadowing

TypePHP tracks variable type contracts using **Lexical Block Scope Frames**. 

When an inline `@var` tag is declared inside a control block (`if`, `elseif`, `else`, `foreach`, `while`, `for`, `try/catch`), the type contract applies **strictly inside that block** and reverts when the block exits:

<TypePHPSnippet title="Block-Level Scope Shadowing" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int */
$z = 10; // Outer contract: positive-int

if (true) {
    /** @var non-empty-string */ 
    $z = 'hello'; // Inner shadow contract: non-empty-string
    echo "✓ Inner scope: {$z}\n";
}

// Outside the if-block, $z safely reverts back to its outer contract: positive-int!
echo "\nAssigning string in outer scope...\n";
$z = 'world'; 
```

</TypePHPSnippet>

> **Unexecuted Code Protection:** Unexecuted branches (such as `if (false)`) never pollute outer scope variable contracts during execution.

---

## Closure Scope Preservation

When a local variable is captured by a short closure (arrow function `fn()`) or a long closure (`use ($var)` or `use (&$var)`), TypePHP inherits and enforces the outer variable contract inside the closure body:

<TypePHPSnippet title="Closure Scope Preservation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var positive-int */
$id = 10;

// 1. Short Closure (Arrow Function)
$arrowFn = fn () => $id = -5;

echo "Executing arrow function...\n";
$arrowFn();
```

</TypePHPSnippet>

This behaves identically for long closures capturing by-reference:

```php:line-numbers
/** @var positive-int */
$id = 10;

$refClosure = function () use (&$id) {
    $id = -99;
};

$refClosure();
// Throws: TypeError: Variable $id must be of type positive-int, negative int (-99) given
```

---

## Fine-Grained Configuration Control

You can enable or disable specific categories of inline variable validation in `typephp.php` without turning off function parameter or return contracts. 

*(You can also test this live by clicking the Configuration (⚙️) gear in the snippets above!)*

```php:line-numbers
// typephp.php
return [
    'inline_vars' => [
        'properties' => true,  // Class property assignments ($this->id = 1)
        'generics'   => true,  // Generic instance prebinding (Collection<User>)
        'callables'  => true,  // Inline callback wrapping (callable(int): string)
        'scalars'    => true,  // Scalar constraints (positive-int, non-empty-string)
        'arrays'     => true,  // Array shapes and lists (array{id: int}, list<T>)
        'objects'    => true,  // Class instance checks (@var User)
    ],
];
```