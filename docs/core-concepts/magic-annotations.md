# Magic Annotations (`@property` & `@method`)

Dynamic properties and magic methods are widely used across modern PHP frameworks (such as Laravel Eloquent models, DTOs, and dynamic service repositories). TypePHP provides transparent runtime enforcement for class-level `@property`, `@property-read`, `@property-write`, and `@method` annotations.

---

## Class-Level Magic Properties (`@property`, `@property-read`, `@property-write`)

When a property does not physically exist on a class, PHP routes property writes through `__set()` and property reads through `__get()`. TypePHP intercepts these dynamic accesses and validates values against class-level `@property`, `@property-read`, and `@property-write` annotations declared on the class, parent classes, interfaces, or traits.

```php
<?php

declare(strict_types=1);

namespace App\DTOs;

/**
 * @property-read string $status
 * @property-write string $name
 * @property positive-int $score
 */
class UserDTO
{
    private array $data = [];

    public function __set(string $name, mixed $value): void
    {
        $this->data[$name] = $value;
    }

    public function __get(string $name): mixed
    {
        return $this->data[$name] ?? null;
    }
}
```

---

### 1. Dynamic Property Writes (`__set`) [Default: Enabled]

By default, TypePHP intercepts assignments to dynamic properties and validates the incoming value against `@property` and `@property-write` annotations before the write occurs:

```php
$user = new UserDTO();

// Valid dynamic property write
$user->score = 100;
$user->name = 'Alice';

// Invalid dynamic property write ($score = -50 violates positive-int)
$user->score = -50;
// Throws: TypeError: Property UserDTO::$score must be of type positive-int, negative int (-50) given

// Invalid dynamic property write ($name = '' violates non-empty-string)
$user->name = '';
// Throws: TypeError: Property UserDTO::$name must be of type non-empty-string, empty string ('') given
```

---

### 2. Dynamic Property Reads (`__get`) [Opt-in via `magic_properties.read => true`]

TypePHP can also validate values returned from dynamic property reads (`$value = $user->status`) through `__get()` against `@property` and `@property-read` annotations:

```php
$user = new UserDTO();

// 1. Valid Read: Returns a string satisfying @property-read string
$user->name = 'Alice';
$user->data['status'] = 'active';

echo $user->status; // Output: 'active'

// 2. Invalid Read: Property was unpopulated or returned null
unset($user->data['status']);

$currentStatus = $user->status;
// Throws: TypeError: Property UserDTO::$status must be of type string, null returned
```

> **Why is read checking opt-in (`read: false` by default)?**  
> In frameworks using Active Record (such as **Laravel Eloquent**), newly instantiated models (`$post = new Post()`) initially return `null` for unhydrated attributes before being saved or populated from the database.
> 
> Keeping `read: false` by default ensures existing framework models run without unexpected crashes on empty attributes. You can enable `'read' => true` for strict DTOs, value objects, and clean architecture layers where reading an unpopulated property should be strictly prevented.

---

## Class-Level Magic Methods (`@method`)

When a method is called dynamically via `__call()` or `__callStatic()`, TypePHP intercepts the invocation and validates both incoming arguments and returned values against class-level `@method` annotations:

```php
<?php

declare(strict_types=1);

namespace App\Services;

/**
 * @phpstan-type StatusUnion 'active'|'pending'
 *
 * @method positive-int processOrder(positive-int $id, non-empty-string $sku)
 * @method static list<int> fetchBatch(int ...$ids)
 * @method bool updateStatus(StatusUnion $status)
 */
class OrderService
{
    public function __call(string $name, array $arguments): mixed
    {
        return $arguments[0] ?? null;
    }

    public static function __callStatic(string $name, array $arguments): mixed
    {
        return $arguments;
    }
}

$service = new OrderService();

// Valid Dynamic Call
$service->processOrder(42, 'SKU-99');

// Invalid Argument ($id = -5 violates positive-int)
$service->processOrder(-5, 'SKU-99');
// Throws: TypeError: OrderService::processOrder(): Argument $id must be of type positive-int

// Invalid Static Variadic Argument ('invalid' violates int)
OrderService::fetchBatch(1, 2, 'invalid');
// Throws: TypeError: OrderService::fetchBatch(): Argument $ids[2] must be of type int
```

---

## DocBlock Inheritance for Magic Annotations

Child classes automatically inherit magic property and method annotations declared across their entire object hierarchy:

* **Parent Classes:** A child class extending a parent inherits all parent `@property` and `@method` annotations.
* **Interfaces:** A class implementing an interface inherits magic annotations declared on the interface.
* **Traits:** A class using a trait inherits all magic annotations declared on the trait.
* **Overriding:** If a child class redeclares an `@property` or `@method` annotation, the child's annotation takes precedence.

---

## Best Practice: Quoted Literals in `@method` Signatures

`phpdoc-parser`'s grammar for `@method` parameter signatures can encounter ambiguity when parsing unparenthesized single quotes directly inside parameter types (such as `@method bool setStatus('active'|'pending' $status)`). When `phpdoc-parser` encounters this grammar ambiguity, it drops that specific `@method` tag.

**Recommended Best Practice:** Define complex union string literals or array shapes using a local `@phpstan-type` alias, and reference the alias in your `@method` annotation:

```php
/**
 * Recommended: Clean & Grammar-Safe via @phpstan-type
 *
 * @phpstan-type StatusUnion 'active'|'pending'
 *
 * @method bool setStatus(StatusUnion $status)
 */
class OrderService
{
    public function __call(string $name, array $arguments) { ... }
}
```

---

## Configuration Toggles

Magic property and magic method validations are customizable in `typephp.php`:

```php
// typephp.php
return [
    /*
    |--------------------------------------------------------------------------
    | Magic Annotations (@property & @method)
    |--------------------------------------------------------------------------
    | Enforces class-level annotations for dynamic properties and magic methods
    | routed through __get, __set, __call, and __callStatic.
    |
    | 'magic_properties' supports granular options:
    | - 'write': (Default: true) Validates dynamic assignments via __set()
    | - 'read' : (Default: false) Validates dynamic property reads via __get()
    |            Enable this for strict DTOs and clean architecture models.
    |
    | Alternatively, set 'magic_properties' => false to disable all checks.
    */
    'magic_properties' => [
        'write' => true,
        'read'  => false,
    ],

    'magic_methods' => true, // Set to false to disable dynamic @method checks
];
```

> **Boolean Shorthand:** Passing `'magic_properties' => false` disables both writes and reads, while `'magic_properties' => true` enables writes with reads defaulting to `false` for complete backward compatibility.