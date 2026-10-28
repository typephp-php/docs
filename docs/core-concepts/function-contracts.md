# Function Contracts

Functions and methods form the public boundaries of your software modules. TypePHP enforces `@param` and `@return` annotations directly at function entry and exit points.

---

## Parameter Contracts (`@param`)

When you declare `@param` annotations on a function or class method, TypePHP validates all incoming arguments before entering the function body.

<TypePHPSnippet title="Parameter Contracts (@param)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int $id
 * @param non-empty-string $username
 * @param 'admin'|'editor'|'viewer' $role
 */
function registerUser(int $id, string $username, string $role): void
{
    echo "✓ Registered {$role}: {$username} (#{$id})\n";
}

// 1. Valid Call
registerUser(100, 'Alice', 'admin');

// 2. Invalid Call: Passing a negative integer!
echo "\nAttempting to register user with negative ID...\n";
registerUser(-5, 'Bob', 'viewer');

echo "This line will never be reached!\n";
```

</TypePHPSnippet>

> **Execution Order Note:** Native PHP type hints (e.g., `int $id`) are evaluated by PHP's C-engine *before* function execution begins. TypePHP's extended PHPDoc contracts (e.g., `positive-int`) execute at the very start of the function/method body. If a native type hint fails, PHP throws its native `TypeError` before TypePHP's guard rails run.

---

## Return Contracts (`@return`)

TypePHP validates `return` statements before values are returned to the caller:

<TypePHPSnippet title="Return Contracts (@return)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @return array{id: positive-int, status: 'active'|'pending'}
 */
function getUserStatus(int $id): array
{
    if ($id <= 0) {
        // Bug! Returning a negative integer violates the array shape contract!
        return ['id' => $id, 'status' => 'active'];
    }

    return ['id' => $id, 'status' => 'active'];
}

echo "Calling getUserStatus(100)...\n";
print_r(getUserStatus(100));

echo "\nCalling getUserStatus(-10)...\n";
getUserStatus(-10);
```

</TypePHPSnippet>

---

## Sensitive Parameter Value Masking (`#[SensitiveParameter]`)

PHP 8.2 introduced the native `#[SensitiveParameter]` attribute to protect sensitive values (such as passwords, API keys, and tokens) from leaking into stack traces.

TypePHP natively detects `#[SensitiveParameter]` on functions, class methods, constructors, promoted properties, and inherited interface contracts. 

For standard parameters, TypePHP prints the exact invalid value (e.g. `negative int (-5) given`) to make debugging effortless. For sensitive parameters, **TypePHP masks the raw value to its native type** to prevent credentials from leaking into log files:

<TypePHPSnippet title="Sensitive Parameter Value Masking" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param non-empty-string $username
 * @param 'correct_secret' $password
 */
function login(
    string $username,
    #[\SensitiveParameter]
    string $password
): void {
    echo "✓ Login successful!\n";
}

// 1. Normal parameter fails -> Full diagnostic visibility!
try {
    login('', 'correct_secret');
} catch (\TypeError $e) {
    echo "Standard Error: " . $e->getMessage() . "\n\n";
}

// 2. Sensitive parameter fails -> Value is safely masked!
try {
    login('admin', 'my_super_secret_password_123');
} catch (\TypeError $e) {
    echo "Sensitive Error: " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Global Value Redaction (`redact_values`)

While `#[SensitiveParameter]` is ideal for targeted parameters, it only works on PHP 8.2+ and cannot protect class properties, return values, or local variables.

To protect massive enterprise applications and ensure GDPR/HIPAA compliance across all error logs and JSON audit reports, TypePHP provides **Global Value Redaction**.

When enabled, TypePHP treats **every single parameter, return value, class property, and local variable** across your entire application as sensitive.

<TypePHPSnippet 
  title="Global Value Redaction" 
  :config="{ redactValues: true }" 
  default-view="source"
>

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int $secretPin
 * @return 'success'|'failure'
 */
function processPayment(int $secretPin): string
{
    return 'pending'; // Bug! Returns invalid literal.
}

// 1. Parameter Failure (Pin value -42 is masked!)
try {
    processPayment(-42);
} catch (\TypeError $e) {
    echo "Parameter Error: " . $e->getMessage() . "\n\n";
}

// 2. Return Failure (Returned literal 'pending' is masked!)
try {
    processPayment(1234);
} catch (\TypeError $e) {
    echo "Return Error: " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

### The Diagnostic Difference

| Violation Context | Standard Output (`redact_values => false`) | Redacted Output (`redact_values => true`) |
|---|---|---|
| **Empty string** | `...must be non-empty-string, empty string ('') given` | `...must be non-empty-string, string given` |
| **Literal strings** | `...must be 'admin', string 'secret_pwd' given` | `...must be 'admin', string given` |
| **Negative numbers** | `...must be positive-int, negative int (-42) given` | `...must be positive-int, int given` |

---

## Native Parameter Nullability (`?Type` and `Type|null`)

In modern PHP, parameters frequently declare native nullable typehints (e.g., `?array $tags = null`). However, PHP's native type system cannot express inner types natively (you cannot write `?string[] $tags = null`).

By default (`'respect_native_nullability' => true`), TypePHP pragmatically merges native parameter nullability with the DocBlock's inner type:

> **Native `?array`** + **DocBlock `string[]`** $\rightarrow$ **Effective Contract: `?string[]` (`string[]|null`)**

<TypePHPSnippet title="Native Nullability Merging" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Notice: The DocBlock omits "|null", but the native signature allows it!
 *
 * @param string[] $groups 
 */
function configureGroups(?array $groups = null): void
{
    echo "✓ Groups configured\n";
}

// 1. Passing null is cleanly accepted!
configureGroups(null);

// 2. Passing valid array of strings is accepted!
configureGroups(['admin', 'editor']);

// 3. Passing an invalid array element still throws!
echo "\nAttempting to pass array containing integer...\n";
configureGroups(['admin', 12345]);
```

</TypePHPSnippet>

### Try the Interactive Challenge:

1. Click **Run** on the snippet above. Notice the error output says `int (12345) given`, revealing the exact raw integer in the array.
2. Click the **Configuration (⚙️)** gear button in the snippet header above.
3. Toggle **Redact Raw Values** to **ON**.
4. Click **Run** again!
5. Notice that the error message dynamically changes to `int given`. The raw integer `12345` has been securely masked by TypePHP's Global Value Redaction!

---

## Tooling Annotation Priority Hierarchy

Modern PHP packages (like Doctrine Collections and Symfony) frequently declare both broad IDE-fallback annotations and strict static analysis contracts on the exact same method signature.

TypePHP resolves the active contract using a deterministic **3-Tier Priority Hierarchy**:

$$\text{1. } \mathbf{@phpstan\text{-}*} \quad \longrightarrow \quad \text{2. } \mathbf{@psalm\text{-}*} \quad \longrightarrow \quad \text{3. } \mathbf{@* \text{ (Standard)}}$$

TypePHP always enforces the tighter, intended contract automatically:

<TypePHPSnippet title="Tooling Annotation Priority" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Collection 
{
    /**
     * @param mixed $element                 // Priority 3: Broad IDE fallback
     * @phpstan-param positive-int $element  // Priority 1: Strict contract!
     */
    public function add(mixed $element): void 
    {
        echo "✓ Added element: {$element}\n";
    }
}

$col = new Collection();
$col->add(42); // Valid (positive-int)

// TypePHP strictly ignores @param mixed and enforces @phpstan-param positive-int!
echo "\nAttempting to add negative integer...\n";
$col->add(-5);
```

</TypePHPSnippet>

---

## PHP 8.0+ Named Arguments

TypePHP natively supports PHP 8.0+ Named Arguments. Because parameter contracts are mapped by parameter name rather than argument position index, you can pass named arguments in any order, and TypePHP will accurately validate each parameter:

<TypePHPSnippet title="Named Arguments Resolution" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int $id
 * @param non-empty-string $username
 * @param int<1, 100> $age
 */
function registerUser(int $id, string $username, int $age): void 
{
    echo "✓ Registered {$username} (ID: {$id}, Age: {$age})\n";
}

// Valid: Arguments passed in completely swapped order
registerUser(age: 25, username: 'Alice', id: 42);

// Invalid: $id (-5) passed as 3rd named argument triggers TypeError accurately on $id
echo "\nPassing negative ID as 3rd named argument...\n";
registerUser(age: 25, username: 'Bob', id: -5);
```

</TypePHPSnippet>

---

## Variadic Parameters (`...$items`)

When a function or method accepts variadic arguments (`...$items`), TypePHP validates every element passed in the variadic argument list:

<TypePHPSnippet title="Variadic Parameter Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param positive-int ...$ids
 */
function deleteUsers(int ...$ids): void 
{
    echo "✓ Deleted " . count($ids) . " users\n";
}

// 1. Valid Call
deleteUsers(10, 20, 30);

// 2. Invalid Call (3rd variadic item violates positive-int)
echo "\nAttempting to delete with a negative ID...\n";
deleteUsers(10, 20, -5);
```

</TypePHPSnippet>

---

## Class Constructors & Property Promotion

TypePHP fully validates class constructor arguments, natively supporting PHP 8.0+ **Constructor Property Promotion**. 

You can define the contract for a promoted property in two ways:
1. Using a standard `@param` tag in the constructor's main DocBlock.
2. Using an inline `/** @var Type */` tag placed **directly above the promoted property argument**. TypePHP intelligently reads the property-level `@var` tag and applies it as a fallback contract for the incoming constructor parameter!

<TypePHPSnippet title="Constructor Property Promotion & @var Fallback" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Account
{
    /**
     * 1. You can use standard @param tags in the method docblock...
     *
     * @param positive-int $accountId
     */
    public function __construct(
        public int $accountId,

        /** 2. Or place @var directly above the promoted property argument! */
        /** @var non-empty-string */
        public string $username
    ) {
        echo "✓ Account created: {$this->username} (#{$this->accountId})\n";
    }
}

// 1. Valid Instance
$account = new Account(42, 'Alice');

// 2. Invalid Instance (Violates @param positive-int)
try {
    echo "\nPassing negative ID...\n";
    new Account(-5, 'Alice');
} catch (\TypeError $e) {
    echo "Caught: " . $e->getMessage() . "\n";
}

// 3. Invalid Instance (Violates inline @var non-empty-string fallback!)
echo "\nPassing empty string username...\n";
new Account(42, '');
```

</TypePHPSnippet>

### Property `@var` Fallback for Standard Constructors

This automatic fallback behavior is not limited to promoted properties. If a standard (non-promoted) constructor parameter lacks a `@param` tag, TypePHP searches the class for a declared property with a matching name and inherits its `@var` contract:

<TypePHPSnippet title="Standard Property @var Fallback" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class User
{
    /**
     * @var non-empty-string[]
     */
    public array $roles;

    // Un-annotated constructor parameter inherits contract from $roles property docblock!
    public function __construct(array $roles)
    {
        $this->roles = $roles;
        echo "✓ User roles assigned\n";
    }
}

$user = new User(['admin', 'editor']);

echo "\nAttempting to instantiate with empty string role...\n";
new User(['admin', '']);
```

</TypePHPSnippet>

---

## Fluent `$this` Identity Returns

For fluent builder or service classes annotated with `@return $this`, TypePHP verifies strict object identity (`$result === $this`), preventing accidental instantiation of new instances:

<TypePHPSnippet title="Fluent $this Identity Returns" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class UserBuilder
{
    /** @return $this */
    public function setName(string $name): self
    {
        echo "✓ Name set to {$name}\n";
        return $this; // Valid: Strict $this identity
    }

    /** @return $this */
    public function cloneSelf(): self
    {
        return new self(); // Invalid: New instance returned instead of $this!
    }
}

$builder = new UserBuilder();
$builder->setName('Alice');

echo "\nAttempting to return a new instance instead of \$this...\n";
$builder->cloneSelf();
```

</TypePHPSnippet>

---

## Late Static Binding Returns (`@return static`)

When a parent class method is annotated with `@return static`, TypePHP enforces **Late Static Binding** at runtime. It dynamically verifies that the returned object is an instance of the **actual calling class**:

<TypePHPSnippet title="Late Static Binding Returns" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class BaseEntityFactory
{
    /** @return static */
    public static function create(): object
    {
        return new static();
    }
    
    /** @return static */
    public static function createSibling(): object
    {
        return new AdminEntityFactory(); // Invalid: Returns sibling instead of calling class!
    }
}

class UserEntityFactory extends BaseEntityFactory {}
class AdminEntityFactory extends BaseEntityFactory {}

echo "Creating valid UserEntityFactory instance...\n";
$user = UserEntityFactory::create();
echo "✓ Created: " . get_class($user) . "\n\n";

// Invalid: UserEntityFactory called, but AdminEntityFactory was returned!
echo "Calling createSibling()...\n";
UserEntityFactory::createSibling();
```

</TypePHPSnippet>

---

## By-Reference Contracts & Mutations

Because by-reference variables (`&$param`), out-parameters (`@param-out`), and in-place mutations (e.g. inside `foreach` loops or `array_walk`) constitute a massive subset of runtime behavior, TypePHP features an entire subsystem dedicated to reference safety.

::: tip Continue Reading
Learn how TypePHP actively guards variables against memory corruption via aliases in the [By-Reference Contracts & Mutations](/core-concepts/by-reference-contracts) guide.
:::