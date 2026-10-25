# Function & Static Method Generics

While class generics parameterize stateful object instances in `\WeakMap` memory, **Function and Static Method Generics** operate ephemerally at the call-site boundary. 

Template parameters (`T`, `K`, `V`) are inferred dynamically from passed arguments upon invocation, pushed onto an isolated call-stack frame, enforced throughout execution, and popped automatically upon exit via `ScopeCleaner`.

---

## How Function-Level Generics Work

When a standalone function or class method declares `@template T`, TypePHP does not bind `T` to a persistent object instance. Instead:

- **Call-Site Inference:** TypePHP inspects the arguments passed to the function at runtime and infers `T` from the first argument matching the template.
- **Call-Frame Stack:** The inferred binding (`T = int`) is stored in an ephemeral call frame (`$callStackBindings`) for the duration of the call.
- **Automatic Frame Cleanup:** The moment the function returns or throws an exception, `ScopeCleaner` pops the call frame, leaving zero memory footprint.
- **Concurrent & Recursive Safety:** Because each invocation receives its own stack frame, recursive calls and concurrent executions maintain isolated template bindings.

---

## Single-Template Inference (`@template T`)

When a function accepts multiple arguments typed as `T`, TypePHP infers `T` from the first argument and strictly enforces that subsequent arguments match:

<TypePHPSnippet title="Function Generic Template Inference" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T
 *
 * @param T $first
 * @param T $second
 * @return list<T>
 */
function pairSameType(mixed $first, mixed $second): array
{
    return [$first, $second];
}

// 1. Valid Call: Infers T = int, both arguments are int
$numbers = pairSameType(10, 20);
echo "✓ Paired integers: " . implode(', ', $numbers) . "\n\n";

// 2. Valid Call: Infers T = string, both arguments are string
$strings = pairSameType('alpha', 'beta');
echo "✓ Paired strings: " . implode(', ', $strings) . "\n\n";

// 3. Invalid Call: Infers T = int from 10, but second argument is a string!
echo "Attempting to pair int with string...\n";
pairSameType(10, 'invalid_string');
```

</TypePHPSnippet>

---

## Multi-Template Functions (`@template K`, `@template V`)

Functions can declare multiple independent generic parameters:

<TypePHPSnippet title="Multi-Template Function Generics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template K of array-key
 * @template V
 *
 * @param K $key
 * @param V $value
 * @return array<K, V>
 */
function createEntry(int|string $key, mixed $value): array
{
    return [$key => $value];
}

// Infers K = string, V = positive-int
$entry = createEntry('timeout', 30);
print_r($entry);

// Infers K = int, V = array{name: string}
$userEntry = createEntry(101, ['name' => 'Alice']);
print_r($userEntry);
```

</TypePHPSnippet>

---

## Static Methods on Generic Classes

A fundamental architectural distinction exists between **instance methods** and **static methods** on a generic class:

- **Instance Methods (`$this->method()`):** Look up `T` from the object instance in `\WeakMap` memory.
- **Static Methods (`Class::method()`):** There is **no `$this` instance** to inspect in memory!

When a generic class declares static methods that use class-level templates:

```php:line-numbers
/**
 * @template T
 */
class Box
{
    /**
     * @param T $item
     */
    public static function inspect(mixed $item): void { ... }
}
```

TypePHP treats `T` inside the static method as a **call-site scoped generic** (behaving identically to function generics). The template `T` is inferred directly from the arguments passed to `Box::inspect($item)` and cleared when the static method completes!

---

## Static Factory Methods (`static<T>`)

Static methods frequently serve as factory constructors that instantiate and return generic objects (`public static function of(T $value): static`). 

When a static method returns `static<T>` or `self<T>`, TypePHP:
1. Infers `T` from the arguments passed to the static factory method.
2. Instantiates the late-static-bound calling class.
3. Automatically **stamps the inferred generic type `T` into `\WeakMap` memory** on the newly created object instance!

<TypePHPSnippet title="Generic Static Factory Method (static<T>)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

class User { public function __construct(public string $name) {} }
class Product { public function __construct(public string $sku) {} }

/**
 * @template T
 */
class Box
{
    /** @var array<int, T> */
    public array $items = [];

    /**
     * Static Factory Constructor
     *
     * @template TValue
     * @param TValue $item
     * @return static<TValue>
     */
    public static function of(mixed $item): static
    {
        $instance = new static();
        $instance->add($item);

        return $instance;
    }

    /**
     * @param T $item
     */
    public function add(mixed $item): void
    {
        $this->items[] = $item;
    }
}

// 1. Static factory infers TValue = User and stamps Box<User> into WeakMap memory!
$userBox = Box::of(new User('Alice'));

echo "✓ Created Box instance holding: " . TypePHP::getGenericType($userBox) . "\n\n";

// 2. Subsequent instance methods enforce the stamped T = User type!
$userBox->add(new User('Bob')); // Valid
echo "✓ Added second user successfully\n\n";

// 3. Adding a Product violates the stamped Box<User> generic contract!
echo "Attempting to add Product into Box<User>...\n";
$userBox->add(new Product('SKU-999'));
```

</TypePHPSnippet>

---

## Dynamic DI & `class-string<T>` Factories

Combine `@template T` with `class-string<T>` to bind template parameters directly from class strings and guarantee matching return instances:

<TypePHPSnippet title="class-string<T> Generic Factory" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface RepositoryInterface
{
    public function getTableName(): string;
}

class UserRepository implements RepositoryInterface
{
    public function getTableName(): string { return 'users'; }
}

class OrderRepository implements RepositoryInterface
{
    public function getTableName(): string { return 'orders'; }
}

class UnrelatedService {}

/**
 * @template T of RepositoryInterface
 * @param class-string<T> $class
 * @return T
 */
function resolveRepository(string $class): RepositoryInterface
{
    return new $class();
}

// 1. Infers T = UserRepository -> Returns UserRepository
$userRepo = resolveRepository(UserRepository::class);
echo "✓ Resolved: " . get_class($userRepo) . " (table: {$userRepo->getTableName()})\n";

// 2. Infers T = OrderRepository -> Returns OrderRepository
$orderRepo = resolveRepository(OrderRepository::class);
echo "✓ Resolved: " . get_class($orderRepo) . " (table: {$orderRepo->getTableName()})\n\n";

// 3. Invalid: UnrelatedService does not implement RepositoryInterface!
echo "Attempting to resolve class that violates upper bound...\n";
resolveRepository(UnrelatedService::class);
```

</TypePHPSnippet>

---

## Variadic Generic Parameters (`@param T ...$items`)

When a function accepts variadic arguments (`...$items`), TypePHP evaluates template consistency across the entire argument list:

### Homogeneous Variadic Generics

When `@template T` is unbounded, **all arguments passed to the variadic parameter must be of the exact same type `T`**:

<TypePHPSnippet title="Homogeneous Variadic Generics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T
 *
 * @param T ...$items
 * @return list<T>
 */
function collectHomogeneous(mixed ...$items): array
{
    return array_values($items);
}

// 1. Valid: All items are integers (T = int)
$list = collectHomogeneous(10, 20, 30);
echo "✓ Collected " . count($list) . " items\n\n";

// 2. Invalid: Item 0 is int, but item 2 is string!
echo "Passing mixed types into homogeneous variadic function...\n";
collectHomogeneous(10, 20, 'invalid_string');
```

</TypePHPSnippet>

### Variadic Generics with Bound Widening (`@template T of Bound`)

If the template declares a union upper bound (`@template T of int|float`), TypePHP dynamically widens `T` to accommodate all arguments that satisfy the bound:

<TypePHPSnippet title="Variadic Template Bound Widening" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T of int|float
 *
 * @param T ...$numbers
 * @return float
 */
function sumNumbers(int|float ...$numbers): float
{
    return (float) array_sum($numbers);
}

// Widens T to (int | float) because both satisfy the bound
$sum = sumNumbers(10, 2.5, 30, 4.75);
echo "✓ Sum: {$sum}\n\n";

// Invalid: String violates the bound (int | float)!
echo "Passing string into bounded numeric variadic...\n";
sumNumbers(10, 2.5, 'invalid');
```

</TypePHPSnippet>

---

## First-Argument Precedence & Disambiguation

When multiple parameters reference the same template parameter:

```php:line-numbers
/**
 * @template T
 * @param T $expected
 * @param T $actual
 */
function assertIdenticalType(mixed $expected, mixed $actual): void { ... }
```

TypePHP adheres to **First-Argument Binding Precedence**:
- The **first parameter** encountering `T` (`$expected`) establishes the binding for that call.
- Any **subsequent parameter** referencing `T` (`$actual`) is validated against the type established by the first argument.
That example is clear, intuitive, and demonstrates how bidirectional inference works in practice.

---

## Bidirectional Inference & Higher-Order Transformers (`array_map`)

TypePHP features a **Bidirectional Generic Inference Engine** that infers and solves template parameters from multiple inputs simultaneously:

- **Forward Direction ($callback \rightarrow \$array$):** TypePHP inspects the callback parameter typehint (`fn (string $str)`) to infer template `V = string`, and then enforces that every element in `$array` (`array<K, V>`) must be a string.
- **Backward Direction ($callback \rightarrow \text{Return}$):** Analyzes what the callback returns (or its declared return contract) to infer `V2`, dynamically constructing the final return contract `array<K, V2>`!

### How TypePHP Resolves Conflicting Generic Bounds (Callback Priority)

When two parameters offer conflicting type evidence:
- The **callback** says: *"I require $str to be a string!"* (`fn (string $str)`)
- The **array** says: *"I contain integers!"* (`['a' => 10]`)

Which argument is at fault?

In `ParamChecker::preInferGenericTemplates()` and `CallableWrapper`, TypePHP gives **first-class inference priority to the explicit native typehint of the closure**. 

Because the closure provides a strict, unambiguous type constraint, TypePHP locks `V = string`. Then, it evaluates the array against the resolved contract `array<K, string>`. It inspects `['a' => 10]`, finds the integer, and blames the array:

<TypePHPSnippet title="Bidirectional Generic Inference (array_map)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App;

/**
 * Emulating array_map signature with bidirectional generics
 *
 * @template K of array-key
 * @template V
 * @template V2
 * 
 * @param callable(V): V2 $callback
 * @param array<K, V> $array
 * @return array<K, V2>
 */
function array_map(callable $callback, array $array): array
{
    $result = [];
    foreach ($array as $key => $value) {
        $result[$key] = $callback($value);
    }

    return $result;
}

echo "--- 1. Valid Call ---\n";
// Forward: Callback specifies int parameter -> V = int
// Backward: Callback returns string -> V2 = string
// Input array has string key and int value -> Clean match!
$valid = array_map(
    fn (int $num): string => "val_$num",
    ['a' => 10]
);
print_r($valid);

echo "\n--- 2. Failure: Bad Callback Input (V mismatch) ---\n";
// WHY TYPEPHP BLAMES THE ARRAY:
// 1. The callback explicitly demands a string: fn (string $str).
// 2. TypePHP prioritizes explicit closure typehints in preInferGenericTemplates() and locks V = string.
// 3. With V = string established, the array contract becomes array<K, string>.
// 4. TypePHP inspects ['a' => 10], catches the integer, and throws an error on the array!
array_map(
    fn (string $str): string => "val_$str",
    ['a' => 10]
);
```

</TypePHPSnippet>

#### The Diagnostic Error Output

When line 43 runs, TypePHP intercepts the discrepancy on function entry:

```text
Fatal error: Uncaught TypePHP\Exception\TypeError: App\array_map(): Argument $array['a'] must be of type string, int (10) given in playground.php on line 43
Stack trace:
#0 playground.php(43): App\array_map(Closure, Array)
#1 {main}
  thrown in playground.php on line 43
```

Notice the diagnostic precision: TypePHP does not wait for the callback to crash inside its body with a cryptic PHP engine error like `TypeError: Closure must be of type string, int given`. **It catches the mismatch immediately at the function boundary**, blaming the exact array element that conflicted with the closure's expectations.

---

## Bidirectional Inference with Untyped Callbacks (`fn ($x) => ...`)

What happens if the callback declares **no native type hints at all**?

```php:line-numbers
/**
 * @template K
 * @template V
 * @template V2
 * @param callable(V): V2 $callback
 * @param array<K, V> $array
 * @return array<K, V2>
 */
function mapNoHints(callable $callback, array $array): array { ... }
```

In this scenario:
1. **Input Inference ($array \rightarrow V$):** Since the closure has no type hints on `$x`, TypePHP infers `V = int` from the input array (`['a' => 10]`) and passes the value into the closure.
2. **Dynamic Return Monomorphization ($callback \rightarrow V2$):** TypePHP observes what the callback returns across iterations to infer `V2`.

### The Untyped Callback Test Suite

Run this interactive test suite to observe how TypePHP resolves unconstrained closures, heterogeneous returns, and engine-level type safety:

<TypePHPSnippet title="Untyped Callbacks & Dynamic Monomorphization" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\UntypedCallbacks;

/**
 * @template K of array-key
 * @template V
 * @template V2
 *
 * @param callable(V): V2 $callback
 * @param array<K, V> $array
 * @return array<K, V2>
 */
function mapNoHints(callable $callback, array $array): array
{
    $result = [];
    foreach ($array as $key => $value) {
        $result[$key] = $callback($value);
    }
    return $result;
}

echo "--- 1. Valid Call (No Hints, Returns Int) ---\n";
$res1 = mapNoHints(fn ($x) => $x * 2, ['a' => 10]);
print_r($res1); // Outputs ['a' => 20]

echo "\n--- 2. Unbound V2 Returns String ---\n";
$res2 = mapNoHints(fn ($x) => "val_" . $x, ['a' => 10]);
print_r($res2); // Outputs ['a' => 'val_10']

echo "\n--- 3. Dynamic Monomorphization (Inconsistent Returns) ---\n";
// Inconsistent returns: returns 100 for 'a', but 'a string' for 'b'
$res3 = mapNoHints(
    function ($x) {
        if ($x === 10) {
            return 100; // int
        }
        return "a string"; // string
    }, 
    ['a' => 10, 'b' => 20]
);
print_r($res3);

echo "\n--- 4. Input Inference & Native Engine Safety ---\n";
try {
    // Array infers V = int (10). 
    // Passing 10 into strtoupper() triggers a native PHP TypeError!
    mapNoHints(
        fn ($x) => strtoupper($x), 
        ['a' => 10]
    );
} catch (\TypeError $e) {
    echo "✓ Caught Expected Native Engine Error: " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Why Inconsistent Returns Succeed (Union Widening)

Look at what happened in **Case 3** above:
- On iteration 1 (`$x === 10`), the closure returned `100` (`int`).
- On iteration 2 (`$x === 20`), the closure returned `"a string"` (`string`).

Why didn't TypePHP crash when the closure returned `"a string"`?

### The `unifyLocalTypes()` Mechanism

Notice the function's DocBlock:
```php:line-numbers
/**
 * @template V2
 * @param callable(V): V2 $callback
 */
```

`V2` is completely **unconstrained** (no upper bound). 

If TypePHP used a naive "lock to the first returned type" strategy, it would have locked `V2 = int` on iteration 1 and crashed on iteration 2. 

Instead, TypePHP's `CallableWrapper` uses `unifyLocalTypes()`. When it sees multiple return types, it **dynamically widens the template into a Union Type**:

$$\text{Iteration 1: } \text{int} \quad + \quad \text{Iteration 2: } \text{string} \quad \longrightarrow \quad \mathbf{V2 = (int \mid string)}$$

Because `V2` has no upper bound, an `int|string` union is completely valid. TypePHP happily accepts the composite array `['a' => 100, 'b' => 'a string']` and returns it.

---

## Enforcing Homogeneous Returns with Upper Bounds (`V2 of int`)

If your business logic demands that a transformer must **never** return mixed or heterogeneous types, simply add an upper bound to `V2`:

```php:line-numbers
/**
 * Constraining V2 to int prevents union widening to strings!
 *
 * @template K of array-key
 * @template V
 * @template V2 of int
 *
 * @param callable(V): V2 $callback
 * @param array<K, V> $array
 * @return array<K, V2>
 */
function mapStrictInts(callable $callback, array $array): array { ... }
```

When run against the inconsistent closure:
1. Iteration 1 returns `100` (satisfies `int`).
2. Iteration 2 returns `"a string"`.
3. TypePHP evaluates `"a string"` against upper bound `int`. Because `"a string"` cannot satisfy `int`, `CallableWrapper` halts execution and throws an immediate `TypeError`!

---

## Input Inference & Native Engine Safety (Case 4)

In **Case 4**:
```php:line-numbers
mapNoHints(
    fn ($x) => strtoupper($x), 
    ['a' => 10]
);
```

Here is what TypePHP and the Zend Engine coordinate:
1. TypePHP inspects `['a' => 10]` and infers `V = int`.
2. Because `$x` has no type hints, TypePHP does not block the input at the outer function boundary.
3. It passes integer `10` into the closure.
4. PHP's native engine executes `strtoupper(10)` and throws `TypeError: strtoupper(): Argument #1 ($string) must be of type string, int given`.

This demonstrates that TypePHP's generic inference is physically sound: it faithfully preserves type flow and coordinates seamlessly with native PHP engine invariants.

---

## Type Unification & Dynamic Widening (`unifyTypes`)

What happens when an input collection contains elements of different types (heterogeneous data) or when a callback returns different subtypes across iterations?

TypePHP does not fail prematurely or fall back to untyped `mixed`. Instead, `TemplateManager::unifyTypes()` **dynamically unifies and widens the inferred template** into a union type:

$$\text{Iteration 1: } \text{Dog} \quad + \quad \text{Iteration 2: } \text{Cat} \quad \longrightarrow \quad \mathbf{T = (Dog \mid Cat)}$$

<TypePHPSnippet title="Template Unification & Widening" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class Animal { public function __construct(public string $name) {} }
class Dog extends Animal {}
class Cat extends Animal {}
class Car {}

/**
 * @template T of Animal
 *
 * @param list<T> $animals
 * @return array<string, T>
 */
function indexAnimals(array $animals): array
{
    $indexed = [];
    foreach ($animals as $animal) {
        $indexed[$animal->name] = $animal;
    }
    return $indexed;
}

// Unifies Dog and Cat into T = (Dog | Cat), which cleanly satisfies upper bound Animal!
$pets = indexAnimals([
    new Dog('Buddy'),
    new Cat('Luna'),
]);

echo "✓ Indexed " . count($pets) . " animal(s) into unified generic map\n";
foreach ($pets as $name => $pet) {
    echo "  • {$name}: " . get_class($pet) . "\n";
}
echo "\n";

// Car does not satisfy the upper bound Animal -> Rejected!
echo "Passing Car into animal pipeline...\n";
indexAnimals([
    new Dog('Buddy'),
    new Car(),
]);
```

</TypePHPSnippet>