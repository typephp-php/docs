# Function Contracts

Functions and methods form the public boundaries of your software modules. TypePHP enforces `@param`, `@param-out`, and `@return` annotations directly at function entry and exit points.

---

## Parameter Contracts (`@param`)

When you declare `@param` annotations on a function or class method, TypePHP validates all incoming arguments before entering the function body:

> **Suppressing Function Contracts:** Need to skip type-checking on a legacy function or method? Add `@typephp-ignore` to its docblock. See [Ignore Annotations](/advanced/ignore-annotations) for full details.

```php
<?php

declare(strict_types=1);

/**
 * @param positive-int $id
 * @param non-empty-string $username
 * @param 'admin'|'editor'|'viewer' $role
 */
function registerUser(int $id, string $username, string $role): void
{
    // Executed only if all arguments pass validation
}

// Valid Call
registerUser(100, 'Alice', 'admin');

// Invalid Call (Passing negative integer)
registerUser(-5, 'Alice', 'admin');
// Throws: TypeError: registerUser(): Argument $id must be of type positive-int, negative int (-5) given
```

> **Execution Order Note:** Native PHP type hints (e.g., `int $id`, `string $username`) are evaluated by PHP's C-engine *before* function execution begins. TypePHP's extended PHPDoc contracts (e.g., `positive-int`, `non-empty-string`) execute at the very start of the function/method body. If a native type hint fails, PHP throws its native `TypeError` before TypePHP's guard rails run.

---

## Sensitive Parameter Value Masking (PHP 8.2+ `#[SensitiveParameter]`)

PHP 8.2 introduced the native `#[SensitiveParameter]` attribute to protect sensitive values (such as passwords, API keys, secret PINs, and bearer tokens) from leaking into stack traces and error monitoring logs (e.g. Sentry, Datadog, log aggregators).

TypePHP natively detects `#[SensitiveParameter]` on functions, class methods, constructors, promoted properties, and inherited interface contracts.

### Why Value Masking Matters

For standard parameters, TypePHP provides rich value inspection (such as `negative int (-5) given` or `empty string ('') given`). However, for sensitive parameters, printing the raw value would risk exposing credentials in exception messages and log files:

```php
use SensitiveParameter;

/**
 * @param non-empty-string $username
 * @param 'correct_secret' $password
 */
function login(
    string $username,
    #[SensitiveParameter]
    string $password
): bool {
    return true;
}

// 1. Normal parameter fails -> Full diagnostic visibility
login('', 'correct_secret');
// Throws: TypeError: login(): Argument $username must be of type non-empty-string, empty string ('') given

// 2. Sensitive parameter fails -> Value is safely masked to native type!
login('admin', 'my_super_secret_password_123');
// Throws: TypeError: login(): Argument $password must be literal 'correct_secret', string given
```

### Native PHP Parity (No Information Disclosure)

Rather than injecting explicit redaction markers like `[redacted]` (which can broadcast to attackers or log scrapers that a specific parameter is a secret), TypePHP achieves **100% exact parity with native PHP's `TypeError` behavior**:
* **`string` parameter:** Formatted as `string given` (raw string value is never printed).
* **`int` parameter:** Formatted as `int given` (raw number or sign is never printed).
* **`array` shape parameter:** Formatted as `string given` / `array given` without dumping sensitive payload keys or structure.

### Supported Sensitive Parameter Scopes

TypePHP enforces sensitive value masking across all declaration styles:

| Declaration Scope | Example | Behavior |
| :--- | :--- | :--- |
| **Standalone Functions** | `function login(#[SensitiveParameter] string $key)` | Value masked on failure |
| **Class Methods** | `public function auth(#[SensitiveParameter] string $token)` | Value masked on failure |
| **Promoted Properties** | `public function __construct(#[SensitiveParameter] public string $secret)` | Value masked on instantiation |
| **Inherited Interfaces** | `interface Auth { public function verify(#[SensitiveParameter] string $pin); }` | Inherited by implementing classes |

---

## Native Parameter Nullability & DocBlock Refinement (`?Type` and `Type|null`)

In modern PHP, parameters frequently declare native nullable typehints:
* **PHP 7.1+ nullable shorthand:** `?array $tags = null`
* **PHP 8.0+ native union syntax:** `int|null $id = null` or `array|null $options = null`

### The Inherent Syntax Limitation in Native PHP

PHP's native type system cannot express inner collection or refinement types in method signatures. You cannot natively write `?string[] $tags = null` or `?positive-int $id = null` in PHP.

Because of this language limitation, developers in major enterprise libraries (including **Symfony**, **Laravel**, and **Doctrine**) universally follow this convention:
1. They declare the **outer nullability** natively in PHP: `?array $groups = null`
2. They use the **DocBlock strictly to describe the inner elements**: `/** @param string[] $groups */`

```php
// Common pattern in Symfony and Laravel:
/**
 * @param string[] $groups // DocBlock omits |null because native PHP already allows null!
 */
public function configure(?array $groups = null): void
{
    // ...
}
```

### How TypePHP Resolves Native Nullability (The Pragmatic Merge)

By default (`'respect_native_nullability' => true`), TypePHP merges native parameter nullability with the DocBlock's inner type:

> **Native `?array`** + **DocBlock `string[]`** $\rightarrow$ **Effective Contract: `?string[]` (`string[]|null`)**

This provides complete type safety without breaking real-world code:
* **Passing `null` (or omitting default argument):** Accepted cleanly.
* **Passing `['admin', 'editor']`:** Accepted, and every element is verified as a valid string.
* **Passing `[12345]`:** Rejected with `TypeError: Argument $groups[0] must be of type string, int (12345) given`.
* **Passing `'not_an_array'`:** Rejected with `TypeError: Argument $groups must be of type array, string given`.

### Supported Native Nullability Syntaxes

TypePHP automatically detects and respects all native PHP nullability declarations:

| Native PHP Signature | DocBlock Annotation | Effective Evaluated Contract |
| :--- | :--- | :--- |
| `?array $tags = null` | `@param string[] $tags` | **`?string[]`** |
| `int\|null $id = null` | `@param positive-int $id` | **`?positive-int`** |
| `array\|null $opts = null` | `@param array{timeout: int} $opts` | **`array{timeout: int}\|null`** |
| `?int $score = null` | `@param int<1, 100> $score` | **`int<1, 100>\|null`** |

### Strict Pedantic Mode (`'respect_native_nullability' => false`)

If your project requires 100% strict DocBlock auditing where DocBlocks are treated as the absolute literal law, set `'respect_native_nullability' => false` in `typephp.php`:

```php
// typephp.php
return [
    'respect_native_nullability' => false,
];
```

In strict mode, if a native parameter is `?array $tags = null` but the DocBlock says `@param string[] $tags` (omitting `|null`), passing `null` will be strictly rejected with a `TypeError`.

---

## Tooling Annotation Priority Hierarchy (`@phpstan-*` > `@psalm-*` > `@*`)

Modern PHP packages and frameworks (such as **Doctrine Collections**, **Symfony**, and **Laravel**) frequently declare both broad IDE-fallback annotations and strict static analysis contracts on the exact same method signature:

```php
/**
 * @param mixed $element            // Broad fallback for standard IDEs
 * @phpstan-param positive-int $element // Refined contract for static analyzers
 *
 * @return mixed
 * @phpstan-return list<positive-int>
 */
public function add(mixed $element): mixed;
```

When multiple tool annotations are declared on the same parameter or return value, TypePHP resolves the active contract using a deterministic **3-Tier Priority Hierarchy**:

$$\text{1. } \mathbf{@phpstan\text{-}*} \quad \longrightarrow \quad \text{2. } \mathbf{@psalm\text{-}*} \quad \longrightarrow \quad \text{3. } \mathbf{@* \text{ (Standard)}}$$

### Why Priority Matters in Real-World Codebases

1. **Refined Contracts Take Precedence:** Tool-specific annotations (`@phpstan-param`, `@phpstan-param-out`, `@psalm-return`) contain specific type constraints (such as generic templates, array shapes, or integer bounds) that standard `@param mixed` omits. TypePHP always enforces the tighter, intended contract.
2. **Third-Party Framework Compatibility:** Libraries like Doctrine Collections declare `@phpstan-param T $element` on `Collection::add` alongside native `mixed $element`. TypePHP automatically prioritizes `@phpstan-param`, making generic collections enforce types at runtime without manual wrapper code.

### Tooling Priority Matrix Across Boundary Contracts

| Boundary Type | Priority 1 (Highest) | Priority 2 | Priority 3 (Fallback) |
| :--- | :--- | :--- | :--- |
| **Parameters (Input)** | `@phpstan-param` | `@psalm-param` | `@param` |
| **Out-Parameters (Exit)** | `@phpstan-param-out` | `@psalm-param-out` | `@param-out` |
| **Return Values** | `@phpstan-return` | `@psalm-return` | `@return` |

---

## PHP 8.0+ Named Arguments

TypePHP natively supports PHP 8.0+ Named Arguments. Because parameter contracts are mapped by parameter name rather than argument position index, you can pass named arguments in any order, and TypePHP will accurately validate each parameter:

```php
<?php

declare(strict_types=1);

/**
 * @param positive-int $id
 * @param non-empty-string $username
 * @param int<1, 100> $age
 */
function registerUser(int $id, string $username, int $age): void
{
    // ...
}

// Valid Call: Arguments passed in completely reversed/swapped order
registerUser(age: 25, username: 'Alice', id: 42);

// Invalid Call: $id (-5) passed as 3rd named argument
registerUser(age: 25, username: 'Alice', id: -5);
// Throws: TypeError: registerUser(): Argument $id must be of type positive-int, negative int (-5) given
```

---

## Arguments Passed By-Reference (`&$param`)

TypePHP natively supports PHP's by-reference parameter semantics (`function update(int &$value)`).

### How By-Reference Input Validation Works (`@param`)

1. **Entry Guard Rails:** TypePHP inspects and validates the variable's value *on function entry* before the function body executes.
2. **In-Place Caller Scope Mutation:** If the argument passes validation, the function body executes normally, and any modifications to the variable mutate the caller's variable in the caller's scope.
3. **Safety Guarantee on Failure:** If an invalid value is passed into a by-reference parameter on entry, a `TypeError` is thrown *before* any code in the function body runs, ensuring the caller's variable remains **100% un-mutated and un-corrupted**.

```php
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

// 1. Valid Call: Value is validated on entry and mutated in caller scope
$userScore = 100;
$userName = 'alice';

applyBonus($userScore, $userName);

echo $userScore; // Output: 150
echo $userName;  // Output: 'ALICE'

// 2. Invalid Call: Throws TypeError on entry, leaving caller variable untouched!
$invalidScore = -10;
$userTag = 'alice';

try {
    applyBonus($invalidScore, $userTag);
} catch (\TypeError $e) {
    echo $invalidScore; // Still -10 (Caller variable was never corrupted!)
}
```

### DocBlock Syntax Flexibility (`&$param` vs. `$param`)

You can write your DocBlock annotations with or without the leading ampersand (`&`). Both are recognized identically by TypePHP's parser:

```php
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

```php
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
echo $id; // Output: 42

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
badInitialize($code);
// Throws: TypeError: badInitialize(): Argument &$value (param-out) must be of type positive-int, negative int (-50) given
```

### Full Type Algebra Support in `@param-out`

`@param-out` supports all advanced types available in TypePHP:
* **Refinements:** `@param-out non-empty-string $token`
* **Array Shapes:** `@param-out array{id: positive-int, token: non-empty-string} $payload`
* **Unions & Intersections:** `@param-out ('active'|'pending') $status`, `@param-out (Countable&ArrayAccess) $collection`
* **Generic Templates:** `@param-out T $output`

### Disabling Out-Parameter Checks Independently

You can independently enable or disable `@param-out` enforcement using the `'params_out'` configuration key in `typephp.php`:

```php
// typephp.php
return [
    'params'     => true, // Enforces @param on entry
    'returns'    => true, // Enforces @return
    'params_out' => true, // Set to false to disable @param-out exit validation
];
```

---

## Class Methods (Instance & Static)

All parameter, return, and out-parameter contract rules apply identically to **instance methods** (`public`, `protected`, `private`) and **static methods**:

```php
class UserService
{
    /**
     * Instance Method Contract
     *
     * @param positive-int $id
     * @return array{id: positive-int, name: non-empty-string}
     */
    public function findUser(int $id): array
    {
        return ['id' => $id, 'name' => 'Alice'];
    }

    /**
     * Static Method Contract
     *
     * @param non-empty-string $role
     * @return list<positive-int>
     */
    public static function getRoleIds(string $role): array
    {
        return [10, 20, 30];
    }
}

$service = new UserService();

// Invalid Instance Method Call ($id is negative)
$service->findUser(-10);
// Throws: TypeError: UserService::findUser(): Argument $id must be of type positive-int

// Invalid Static Method Call ($role is empty string)
UserService::getRoleIds('');
// Throws: TypeError: UserService::getRoleIds(): Argument $role must be of type non-empty-string
```

---

## Class Constructors (`__construct`)

TypePHP fully validates class constructor arguments, supporting both standard constructors and **Constructor Property Promotion** (PHP 8.0+).

### Promoted Properties (PHP 8.0+)

Annotate promoted properties in the constructor's docblock using standard `@param` or `@phpstan-param` tags:

```php
class Order
{
    /**
     * @param positive-int $id
     * @param non-empty-string $sku
     * @param int<1, 100> $quantity
     */
    public function __construct(
        public int $id,
        public string $sku,
        public int $quantity
    ) {}
}

// Valid Instance
new Order(1, 'SKU-99', 5);

// Invalid Instance ($id is negative)
new Order(-1, 'SKU-99', 5);
// Throws: TypeError: Order::__construct(): Argument $id must be of type positive-int
```

### Property `@var` Fallback for Un-Annotated Constructors

If a constructor parameter is un-annotated (or lacks a `@param` tag), TypePHP automatically inspects the corresponding class property's `@var` / `@phpstan-var` docblock to infer the parameter contract:

```php
class User
{
    /**
     * @var string[]
     */
    public array $roles;

    // Un-annotated constructor parameter inherits contract from $roles property docblock!
    public function __construct(array $roles)
    {
        $this->roles = $roles;
    }
}

// Invalid Instance (element 1 is an integer)
new User(['admin', 12345]);
// Throws: TypeError: User::__construct(): Argument $roles[1] must be of type string, int (12345) given
```

---

## Return Contracts (`@return`)

TypePHP validates `return` statements before values are returned to the caller:

```php
/**
 * @return array{id: positive-int, status: 'active'|'pending'}
 */
function getUserStatus(int $id): array
{
    if ($id <= 0) {
        return ['id' => $id, 'status' => 'active']; // Invalid: $id is negative
    }

    return ['id' => $id, 'status' => 'active'];
}

getUserStatus(-10);
// Throws: TypeError: getUserStatus(): Return value['id'] must be of type positive-int
```

---

## Fluent `$this` Identity Returns

For fluent builder or service classes annotated with `@return $this`, TypePHP verifies strict object identity (`$result === $this`), preventing accidental instantiation of new instances:

```php
class UserBuilder
{
    private string $name = '';

    /**
     * @return $this
     */
    public function setName(string $name): self
    {
        $this->name = $name;

        return $this; // Valid: Strict $this identity
    }

    /**
     * @return $this
     */
    public function cloneSelf(): self
    {
        return new self(); // Invalid: New instance returned instead of $this
    }
}

$builder = new UserBuilder();
$builder->cloneSelf();
// Throws: TypeError: UserBuilder::cloneSelf(): Return value must be $this instance
```

---

## Late Static Binding Return Contracts (`@return static`)

When a parent class method (static factory method or fluent instance method) is annotated with `@return static`, TypePHP enforces **Late Static Binding** at runtime. 

It dynamically verifies that the returned object is an instance of the **actual calling class** (`UserEntityFactory`), strictly rejecting parent instances (`BaseEntityFactory`), sibling instances (`AdminEntityFactory`), or generic objects (`stdClass`):

```php
abstract class BaseEntityFactory
{
    /**
     * @return static
     */
    public static function create(): static
    {
        return new static();
    }

    /**
     * @return static
     */
    public static function createSibling(): object
    {
        return new AdminEntityFactory(); // Invalid: Returns sibling instead of calling class!
    }
}

class UserEntityFactory extends BaseEntityFactory {}
class AdminEntityFactory extends BaseEntityFactory {}

// Valid: Returns UserEntityFactory instance matching the late-static calling class
$user = UserEntityFactory::create();

// Invalid: UserEntityFactory called, but AdminEntityFactory was returned!
UserEntityFactory::createSibling();
// Throws: TypeError: UserEntityFactory::createSibling(): Return value must be of type App\UserEntityFactory, App\AdminEntityFactory returned
```

### Late Static Binding with Generics (`static<T>`)

Late static binding seamlessly integrates with TypePHP's Reified Generics engine. A static factory can return a specialized generic instance of the late-static-bound calling class:

```php
/**
 * @template T
 */
abstract class BaseGenericFactory
{
    /**
     * @template TValue
     * @param TValue $value
     * @return static<TValue>
     */
    public static function of(mixed $value): static
    {
        return new static($value);
    }
}

class UserGenericFactory extends BaseGenericFactory {}

// 1. Returns UserGenericFactory instance
// 2. Binds generic template T = Dog in WeakMap memory!
$factory = UserGenericFactory::of(new Dog());
```

---

## Variadic Parameter Contracts

When a function or method accepts variadic arguments (`...$items`), TypePHP validates every element passed in the variadic argument list:

```php
/**
 * @param positive-int ...$ids
 */
function deleteUsers(int ...$ids): void
{
    // ...
}

// Valid Call
deleteUsers(10, 20, 30);

// Invalid Call (3rd variadic item violates positive-int)
deleteUsers(10, 20, -5);
// Throws: TypeError: deleteUsers(): Argument $ids[2] must be of type positive-int
```

---

## Conditional Return Types

TypePHP supports parameter-based conditional return types (`@return ($param is true ? TypeA : TypeB)`):

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

// Valid Calls
formatValue(true, 42);       // Evaluates return type as positive-int
formatValue(false, 'hello'); // Evaluates return type as non-empty-string

// Invalid Call
formatValue(true, 'not_an_int');
// Throws: TypeError: formatValue(): Return value must be of type positive-int
```

---

## PHP 8.0+ Attributes Coexistence

TypePHP seamlessly coexists with native PHP 8.0+ Attributes (`#[Route]`, `#[Inject]`, `#[Validate]`, `#[SensitiveParameter]`). 

You can place your PHPDoc annotations **either above or below** native PHP attributes on properties, methods, or functions. TypePHP's AST engine and PHP's Reflection API process both metadata channels independently without any syntax conflicts:

```php
// Option A: DocBlock ABOVE Attribute (Supported)
/**
 * @param positive-int $id
 * @return array{id: positive-int, username: non-empty-string}
 */
#[Route('/user/{id}', method: 'GET')]
public function showUser(int $id): array
{
    return ['id' => $id, 'username' => 'Alice'];
}

// Option B: DocBlock BELOW Attribute (Supported)
#[Route('/user/{id}', method: 'GET')]
/**
 * @param positive-int $id
 * @return array{id: positive-int, username: non-empty-string}
 */
public function showUser(int $id): array
{
    return ['id' => $id, 'username' => 'Alice'];
}
```
