# Magic Annotations (`@property` & `@method`)

Dynamic properties and magic methods are widely used across modern PHP frameworks (such as Laravel Eloquent models, DTOs, and dynamic service repositories). TypePHP provides transparent runtime enforcement for class-level `@property`, `@property-read`, `@property-write`, and `@method` annotations.

---

## Class-Level Magic Properties (`@property`, `@property-write`)

When a property does not physically exist on a class, PHP routes property writes through the `__set()` magic method. TypePHP intercepts these dynamic accesses and validates incoming values against class-level `@property` and `@property-write` annotations declared on the class, parent classes, interfaces, or traits.

By default, **dynamic property writes are enabled** in TypePHP.

<TypePHPSnippet title="Magic Property Writes (__set)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @property positive-int $score
 * @property-write non-empty-string $name
 */
class DynamicModel
{
    private array $data = [];

    public function __set(string $name, mixed $value): void
    {
        $this->data[$name] = $value;
        echo "✓ Successfully wrote to dynamic property '{$name}'\n";
    }
}

$model = new DynamicModel();

// 1. Valid dynamic property writes
$model->score = 100;
$model->name = 'Alice';

// 2. Invalid dynamic property write ($score = -50 violates positive-int)
echo "\nAttempting to assign negative score...\n";
try {
    $model->score = -50;
} catch (\TypeError $e) {
    echo "Caught: " . $e->getMessage() . "\n";
}

// 3. Invalid dynamic property write ($name = '' violates non-empty-string)
echo "\nAttempting to assign empty string to name...\n";
$model->name = '';
```

</TypePHPSnippet>

---

## Dynamic Property Reads (`__get`)

TypePHP can also validate values returned from dynamic property reads (`$value = $user->status`) through the `__get()` magic method against `@property` and `@property-read` annotations.

> **Why are magic reads opt-in (`read: false` by default)?**  
> In Active Record frameworks (like **Laravel Eloquent**), newly instantiated models (`$post = new Post()`) initially return `null` for unhydrated attributes before being saved or populated from the database.
> 
> Keeping `read: false` by default ensures existing framework models run without unexpected crashes on empty attributes. You should enable `'read' => true` for strict DTOs, value objects, and clean architecture layers where reading an unpopulated property should be strictly prevented.

In the interactive snippet below, we have explicitly enabled `magicPropertyReads` to demonstrate how TypePHP catches invalid dynamic reads:

<TypePHPSnippet 
  title="Magic Property Reads (__get)" 
  :config="{ magicPropertyReads: true }" 
  default-view="source"
>

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @property-read string $status
 */
class StatusModel
{
    public array $data = [];

    public function __get(string $name): mixed
    {
        // Notice this returns null if the key doesn't exist!
        return $this->data[$name] ?? null;
    }
}

$model = new StatusModel();

// 1. Valid Read: Returns a string satisfying @property-read string
$model->data['status'] = 'active';
echo "✓ Read status: " . $model->status . "\n\n";

// 2. Invalid Read: Property was unpopulated or returned null!
unset($model->data['status']);

echo "Reading unpopulated @property-read string (returns null)...\n";
$currentStatus = $model->status;
```

</TypePHPSnippet>

*(Click the Configuration (⚙️) gear above and toggle off **Property Reads (__get)** to see the script execute to completion without crashing!)*

---

## Class-Level Magic Methods (`@method`)

When a method is called dynamically via `__call()` or `__callStatic()`, TypePHP intercepts the invocation and validates both incoming arguments and returned values against class-level `@method` annotations:

<TypePHPSnippet title="Magic Methods (__call & __callStatic)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

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

// 1. Valid Dynamic Calls
$service->processOrder(42, 'SKU-99');
OrderService::fetchBatch(1, 2, 3);
echo "✓ Magic method calls succeeded\n\n";

// 2. Invalid Argument ($id = -5 violates positive-int)
try {
    echo "Passing negative ID to @method...\n";
    $service->processOrder(-5, 'SKU-99');
} catch (\TypeError $e) {
    echo "Caught: " . $e->getMessage() . "\n\n";
}

// 3. Invalid Static Variadic Argument ('invalid' violates int)
echo "Passing string to variadic @method expecting ints...\n";
OrderService::fetchBatch(1, 2, 'invalid');
```

</TypePHPSnippet>

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

```php:line-numbers
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

Magic property and magic method validations are highly customizable in your `typephp.php` configuration file:

```php:line-numbers
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
