# Callables & Closures

TypePHP provides lazy runtime interception for callbacks, Closures, invokable objects (`__invoke`), array callables, PHP 8.1+ first-class callables, by-reference callback mutations, and PHPStan static-closure specifications.

---

## How Callback Interception Works (`CallableWrapper`)

When a function parameter, return value, or local variable is annotated with a callable contract (such as `callable(positive-int): non-empty-string`), TypePHP wraps the callable in a lazy interceptor proxy:

- **Lazy Execution:** TypePHP does not execute the callback immediately when passed as an argument.
- **Input Validation:** When the wrapped callback is invoked, TypePHP validates the arguments passed into the callback against the declared parameter types.
- **Output Validation:** When the callback returns, TypePHP validates the returned value against the callback's declared return contract.
- **Reference Preservation:** If the callback takes arguments by reference (`callable(Type &$ref)`), TypePHP preserves in-place mutations on the caller's variable.
- **Zero Overhead on Uncalled Callbacks:** If a callback is passed to a function but never invoked in that specific execution branch, zero validation overhead occurs.

---

## Basic Callable Contracts (`callable(T1, T2): R`)

Declare argument and return types for callbacks using standard `callable(Type1, Type2): ReturnType` syntax:

<TypePHPSnippet title="Basic Callable Contracts" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * TypePHP wraps $formatter in a proxy closure that validates
 * incoming arguments and outgoing return values upon invocation.
 *
 * @param callable(positive-int, non-empty-string): non-empty-string $formatter
 */
function formatRecord(int $id, string $tag, callable $formatter): string
{
    return $formatter($id, $tag);
}

// 1. Valid callback execution
$result = formatRecord(42, 'ADMIN', fn (int $id, string $tag): string => "[{$tag}] #{$id}");
echo "✓ Callback result: {$result}\n\n";

// 2. Invalid Callback Return: Returns empty string violating non-empty-string!
echo "Executing callback returning empty string...\n";
formatRecord(42, 'ADMIN', fn (int $id, string $tag): string => '');
```

</TypePHPSnippet>

---

## Discarded Returns in `void` Callback Contracts (`callable(): void`)

It is important to understand the fundamental difference between **native PHP `: void` typehint syntax** and **PHPDoc `@return void` contracts**.

### Native PHP `: void` Syntax (Language Level)
When a function or closure explicitly declares native PHP `: void` return syntax (`function(): void`), PHP's Zend Engine strictly forbids returning any value. Attempting to return a value results in a native PHP compile-time or runtime error:

```php:line-numbers
$func = function (int $a): void {
    return $a; // Native PHP Fatal Error: A void function must not return a value
};
```

### PHPDoc `@return void` Contracts (TypePHP Level)
In contrast, when higher-order utility functions (such as `array_map`, `each`, or event listeners) accept callbacks annotated with a PHPDoc **`@return void`** contract (`callable(T): void`), developers frequently pass short arrow functions or helper methods that return a value as a side-effect (e.g. `$user->save()`, which returns a `bool` status).

If a type checker treated `@return void` with strict pedantic rigidity, every short arrow function returning a value would trigger a false-positive `TypeError`.

**TypePHP's Design Choice:** For callbacks annotated with PHPDoc `@return void`, TypePHP **discards the return value rather than throwing an exception**. This ensures full compatibility with PHP short arrow functions (`fn() => $expr`) while still strictly validating incoming argument types:

<TypePHPSnippet title="Discarded Returns in void Callbacks" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class User
{
    public function save(): bool
    {
        return true; // Returns boolean status
    }
}

/**
 * Expects a callback that performs a side-effect (returns void)
 *
 * @param callable(User): void $callback
 */
function tapUser(User $user, callable $callback): User
{
    // TypePHP executes the callback and safely discards any returned value
    $callback($user);
    
    return $user;
}

$user = new User();

// Short arrow function implicitly returns boolean true from $u->save().
// TypePHP discards the boolean return value rather than throwing a TypeError!
tapUser($user, fn (User $u) => $u->save());

echo "✓ Short arrow function with implicit return safely accepted for void callback\n";
```

</TypePHPSnippet>

---

## By-Reference Callback Parameters (`callable(Type &$ref)`)

When a callback accepts arguments by reference (e.g. `callable(positive-int &$val): void`), TypePHP uses **Signature-Aware Reference Dispatching** to preserve caller references in real memory:

1. **In-Place Mutation:** Modifications performed inside the callback mutate the caller's variable in the caller's scope.
2. **Input Validation on Entry:** Incoming by-reference variables are validated before the callback body executes.
3. **Post-Mutation Validation on Exit:** When the callback finishes, TypePHP verifies that the mutated value still satisfies the declared type contract before returning control.

<TypePHPSnippet title="By-Reference Callback Mutations" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param callable(positive-int &$num): void $mutator
 */
function applyBonus(callable $mutator, int &$score): void
{
    $mutator($score);
}

$userScore = 10;

// 1. Valid In-Place Mutation
applyBonus(function (int &$num): void {
    $num += 50;
}, $userScore);

echo "✓ Score after callback mutation: {$userScore}\n\n";

// 2. Invalid Post-Mutation (Callback sets score to -999 violating positive-int)
echo "Attempting to assign negative score inside callback...\n";
applyBonus(function (int &$num): void {
    $num = -999;
}, $userScore);
```

</TypePHPSnippet>

### Native `array_walk()` Integration

TypePHP detects mixed by-reference and by-value signatures (such as `array_walk` where the array value is passed by reference and the key is passed by value) with zero PHP reference warnings:

<TypePHPSnippet title="array_walk By-Reference Integration" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param callable(positive-int &$item, array-key $key): void $callback
 * @param list<positive-int> &$items
 */
function doubleList(callable $callback, array &$items): void
{
    array_walk($items, $callback);
}

$numbers = [1, 2, 3, 4];

doubleList(function (int &$item, mixed $key): void {
    $item *= 10;
}, $numbers);

echo "✓ Transformed List: " . implode(', ', $numbers) . "\n";
```

</TypePHPSnippet>

---

## Generic Callables with Template Substitution (`@template T`)

When a function uses generic template parameters (`@template T`), TypePHP dynamically substitutes `T` into the callable's parameter and return types based on the bound generic type:

<TypePHPSnippet title="Generic Callback with Template Substitution" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T
 *
 * @param callable(T): T $transformer
 * @param T $input
 * @return T
 */
function transformValue(callable $transformer, mixed $input): mixed
{
    return $transformer($input);
}

// 1. Infers T = int, validates callback input (int) and return (int)
$double = fn (int $x): int => $x * 2;
$doubled = transformValue($double, 21);
echo "✓ Integer transformation: {$doubled}\n\n";

// 2. Invalid Callback Return: T is inferred as int (from 10), but callback returns string!
$badReturn = fn (int $x): string => 'invalid_return';
echo "Calling transformer with callback returning incompatible type...\n";
transformValue($badReturn, 10);
```

</TypePHPSnippet>

---

## Strict Closure Instance Contracts (`Closure(T): R`)

When you specify `Closure(T): R` instead of `callable(T): R`, TypePHP strictly requires a native `\Closure` instance, rejecting string function names or invokable objects:

<TypePHPSnippet title="Strict Closure Instance Contract" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class InvokableService
{
    public function __invoke(int $id): string
    {
        return "user_{$id}";
    }
}

/**
 * Strictly requires a native \Closure instance!
 *
 * @param Closure(positive-int): non-empty-string $closure
 */
function executeClosureOnly(Closure $closure): string
{
    return $closure(42);
}

// 1. Valid Call (Native closure)
$output = executeClosureOnly(fn (int $id) => "user_{$id}");
echo "✓ Closure executed: {$output}\n\n";

// 2. Invalid Call: Invokable object passed where Closure was required!
echo "Passing invokable object where Closure was required...\n";
executeClosureOnly(new InvokableService());
```

</TypePHPSnippet>

---

## Closure Identity & Proxy Wrapping (`===` Comparisons)

When TypePHP intercepts a `callable` or `Closure` parameter, it wraps the instance in a proxy closure (`CallableWrapper`) to enforce parameter types, return contracts, and by-reference mutations dynamically at invocation time.

Because a property or variable holds the TypePHP proxy wrapper rather than the raw, unwrapped closure, **strict object reference equality (`===`) between the stored property and the original closure instance evaluates to `false`**:

<TypePHPSnippet title="Closure Identity & Proxy Comparison" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

final class ClosureContainer
{
    /**
     * @param Closure(positive-int): non-empty-string $factory
     */
    public function __construct(public Closure $factory) {}
}

$originalClosure = static fn (int $id): string => "user_{$id}";
$container = new ClosureContainer($originalClosure);

// 1. Invocation is fully protected and type-checked at runtime:
$output = ($container->factory)(42);
echo "✓ Invocation output: {$output}\n\n";

// 2. Strict object identity comparison evaluates to false:
$isSame = ($container->factory === $originalClosure);
echo "Strict identity comparison (===): " . ($isSame ? 'true' : 'false') . "\n";
echo "  (Evaluates to false because \$container->factory holds a TypePHP CallableWrapper proxy)\n";
```

</TypePHPSnippet>

### Consistency Across Property Syntaxes

Both standard parameter assignments (`$this->factory = $factory`) and Constructor Property Promotion (`public Closure $factory`) receive the TypePHP proxy wrapper identically, ensuring runtime contracts are always enforced when the closure is invoked downstream.

---

## Array & First-Class Callables (PHP 8.1+)

TypePHP seamlessly intercepts instance method array callables (`[$service, 'method']`), static class-string array callables (`[ServiceClass::class, 'method']`), and PHP 8.1+ First-Class Callable syntax (`$obj->method(...)`), ensuring full runtime type checking across all invocation styles:

<TypePHPSnippet title="Array and First-Class Callables Type Enforcement" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\Exception\TypeError;

class UserService
{
    public function formatUser(int $id): string
    {
        return "user_{$id}";
    }

    public static function staticFormat(int $id): string
    {
        return "static_user_{$id}";
    }
}

/**
 * @param callable(positive-int): non-empty-string $formatter
 */
function executeFormatter(callable $formatter, int $id): string
{
    return $formatter($id);
}

$service = new UserService();

// 1. Valid Instance Method Array Callable: [$service, 'formatUser']
$instanceCallable = [$service, 'formatUser'];
echo "✓ Instance Array Callable: " . executeFormatter($instanceCallable, 50) . "\n";

// 2. Valid Static Class-String Array Callable: [UserService::class, 'staticFormat']
$staticCallable = [UserService::class, 'staticFormat'];
echo "✓ Static Class-String Callable: " . executeFormatter($staticCallable, 75) . "\n";

// 3. Valid PHP 8.1+ First-Class Callable: $service->formatUser(...)
$firstClassCallable = $service->formatUser(...);
echo "✓ First-Class Callable: " . executeFormatter($firstClassCallable, 100) . "\n\n";

// 4. Runtime Type Enforcement on Array Callable
echo "Attempting to pass negative ID through Array Callable...\n";
try {
    executeFormatter($instanceCallable, -10);
} catch (TypeError $e) {
    echo "✓ Caught TypeError (Array Callable):\n   " . $e->getMessage() . "\n\n";
}

// 5. Runtime Type Enforcement on First-Class Callable
echo "Attempting to pass negative ID through First-Class Callable...\n";
try {
    executeFormatter($firstClassCallable, -20);
} catch (TypeError $e) {
    echo "✓ Caught TypeError (First-Class Callable):\n   " . $e->getMessage() . "\n";
}
```
</TypePHPSnippet>

---

## Higher-Order Functions Returning Callables

TypePHP recursively wraps functions that return other callback functions (e.g. factory pipelines, curried validators, and middleware handlers), enforcing argument and return contracts across all invocation stages:

<TypePHPSnippet title="Higher-Order Curried Callables" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class ValidationPipeline
{
    /**
     * Method returning a curried validator function
     *
     * @return callable(positive-int): (callable(non-empty-string): bool)
     */
    public function createLengthValidator(): callable
    {
        return function (int $minLength): callable {
            return function (string $text) use ($minLength): bool {
                return strlen($text) >= $minLength;
            };
        };
    }
}

$pipeline = new ValidationPipeline();
$factory = $pipeline->createLengthValidator();

// Stage 1: Configure validator with minLength = 5
$minFiveValidator = $factory(5);

// Stage 2: Execute configured validator
echo "Validation for 'Hello World': " . ($minFiveValidator('Hello World') ? 'Passed' : 'Failed') . "\n";
echo "Validation for 'Hi': " . ($minFiveValidator('Hi') ? 'Passed' : 'Failed') . "\n\n";

// Invalid Stage 1 Argument: $minLength = -1 violates positive-int!
echo "Configuring validator with invalid negative length -1...\n";
$factory(-1);
```

</TypePHPSnippet>

---

## Static Closures (`static-closure`)

Enforce that a closure must be declared with the `static` keyword (meaning it cannot bind or reference `$this`):

<TypePHPSnippet title="Static Closures (static-closure)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class CalculationContext
{
    private int $factor = 2;

    /**
     * @param static-closure(positive-int): positive-int $closure
     */
    public function executePure(Closure $closure): int
    {
        return $closure(10);
    }

    public function testExecution(): void
    {
        // 1. Valid: Pure static closure (not bound to $this)
        $res = $this->executePure(static fn (int $x) => $x * 2);
        echo "✓ Pure static closure executed: {$res}\n\n";

        // 2. Invalid: Non-static closure bound to $this!
        echo "Passing closure bound to \$this where static-closure was expected...\n";
        $this->executePure(fn (int $x) => $x * $this->factor);
    }
}

(new CalculationContext())->testExecution();
```

</TypePHPSnippet>

---

## Inline `@var` Callable Contracts

Enforce argument and return contracts on local variables assigned with inline `@var` callable docblocks:

<TypePHPSnippet title="Inline @var Callable Contracts" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/** @var callable(positive-int, non-empty-string): bool */
$formatter = fn (int $id, string $name) => strlen($name) > 0;

// Valid call
$ok = $formatter(10, 'Alice');
echo "✓ Valid callback call returned: " . ($ok ? 'true' : 'false') . "\n\n";

// Passing negative ID to the local callable triggers TypeError!
echo "Invoking local callable with negative ID...\n";
$formatter(-5, 'Alice');
```

</TypePHPSnippet>
