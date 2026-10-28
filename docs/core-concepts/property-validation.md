# Property Validation

TypePHP validates class property assignments, `readonly` initializations, and PHP 8.4 Property Hooks against their declared `@var` annotations at runtime.

---

## Instance & Static Property Assignments

When you annotate a class property with `@var`, TypePHP intercepts assignments to that property and validates the value *before* the write occurs:

<TypePHPSnippet title="Instance & Static Properties" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class ConfiguredProperty
{
    /**
     * Instance Property Contract
     *
     * @var positive-int
     */
    public int $id = 10;

    /**
     * Static Property Contract
     *
     * @var non-empty-string
     */
    public static string $appTitle = 'TypePHP';

    public function updateId(int $newId): void
    {
        // Validated against @var positive-int
        $this->id = $newId; 
    }

    public static function updateTitle(string $newTitle): void
    {
        // Validated against @var non-empty-string
        self::$appTitle = $newTitle; 
    }
}

$config = new ConfiguredProperty();

// 1. Valid Updates
$config->updateId(42);
ConfiguredProperty::updateTitle('Production App');
echo "✓ Properties updated successfully!\n\n";

// 2. Invalid Static Update: Empty string violates non-empty-string!
try {
    echo "Attempting to assign empty string to static property...\n";
    ConfiguredProperty::updateTitle('');
} catch (\TypeError $e) {
    echo "Caught: " . $e->getMessage() . "\n\n";
}

// 3. Invalid Instance Update: Negative int violates positive-int!
echo "Attempting to assign negative ID to instance property...\n";
$config->updateId(-5);
```

</TypePHPSnippet>

---

## PHP 8.1+ Readonly Properties

TypePHP flawlessly validates PHP 8.1+ `readonly` properties and PHP 8.2+ `readonly` classes during their one-time initialization:

<TypePHPSnippet title="Readonly Property Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class Order
{
    /**
     * @var positive-int
     */
    public readonly int $id;

    /**
     * @param non-empty-string $sku
     */
    public function __construct(
        int $id,
        public readonly string $sku
    ) {
        // Validated against @var positive-int during initialization!
        $this->id = $id; 
    }
}

// 1. Valid Instance
$order = new Order(100, 'SKU-500');
echo "✓ Order initialized with ID: {$order->id}\n\n";

// 2. Invalid Instance ($id is negative, violating positive-int)
echo "Attempting to initialize Order with negative ID...\n";
new Order(-50, 'SKU-500');
```

</TypePHPSnippet>

---

## PHP 8.4 Asymmetric Visibility (`public private(set)`)

TypePHP seamlessly supports PHP 8.4 Asymmetric Property Visibility. Type contracts on asymmetric properties are enforced when writes occur inside the authorized class scope:

<TypePHPSnippet title="PHP 8.4 Asymmetric Visibility" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class UserProfile
{
    /**
     * Public read, private set
     *
     * @var positive-int
     */
    public private(set) int $id = 10;

    public function setId(int $newId): void
    {
        // TypePHP validates the assignment inside the class!
        $this->id = $newId; 
    }
}

$profile = new UserProfile();

$profile->setId(42); // Valid
echo "✓ Profile ID set to: {$profile->id}\n\n";

echo "Attempting to set negative profile ID...\n";
$profile->setId(-100);
```

</TypePHPSnippet>

---

## PHP 8.4 Property Hooks (`get` & `set`)

TypePHP intercepts PHP 8.4 `get` and `set` property hooks. It automatically validates incoming values assigned to `set` hooks, and returned values produced by `get` hooks!

<TypePHPSnippet title="PHP 8.4 Property Hooks" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class PropertyHookDemo
{
    /**
     * @var list<int>
     */
    public array $shortGetNumbers {
        // Bug! Returns invalid string 'hello' instead of int
        get => ['hello', 1]; 
    }

    /**
     * @var positive-int
     */
    public int $shortSetNumber {
        // TypePHP intercepts and validates $value before execution!
        set => $this->_shortSetNumber = $value; 
    }

    public int $_shortSetNumber = 10;
}

$demo = new PropertyHookDemo();

// 1. Invalid Get Hook Return
try {
    echo "Reading from buggy get hook...\n";
    $value = $demo->shortGetNumbers;
} catch (\TypeError $e) {
    echo "Caught: " . $e->getMessage() . "\n\n";
}

// 2. Invalid Set Hook Write (Violates positive-int)
echo "Writing negative number to set hook...\n";
$demo->shortSetNumber = -5;
```

</TypePHPSnippet>

---

## Interface Property Inheritance (PHP 8.4)

If a class implements a PHP 8.4 Interface containing property hooks, the implementing class property automatically inherits the interface property's `@var` docblock contract:

<TypePHPSnippet title="Interface Property Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface HookedInterfaceProperty
{
    /**
     * @var positive-int
     */
    public int $interfaceProp { get; }
}

class HookedInterfaceImplementation implements HookedInterfaceProperty
{
    // Inherits @var positive-int from HookedInterfaceProperty!
    public int $interfaceProp {
        get => $this->_val;
    }

    public int $_val = 10;
}

$fixture = new HookedInterfaceImplementation();

// By directly altering the backing value, we corrupt the get hook return
$fixture->_val = -5;

echo "Attempting to read interface property returning negative value...\n";
$value = $fixture->interfaceProp;
```

</TypePHPSnippet>

---

## Trait Property Inheritance

Properties declared inside Traits inherit their `@var` docblock contracts when used by a class:

<TypePHPSnippet title="Trait Property Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

trait TraitWithProperties
{
    /**
     * @var positive-int
     */
    public int $traitInstanceProp = 10;

    public function setTraitProp(int $val): void
    {
        $this->traitInstanceProp = $val;
    }
}

class ClassUsingTrait
{
    use TraitWithProperties;
}

$app = new ClassUsingTrait();

$app->setTraitProp(100); // Valid
echo "✓ Trait property updated\n\n";

echo "Attempting to assign negative value to trait property...\n";
$app->setTraitProp(-50);
```

</TypePHPSnippet>

---

## Generic Template Substitution in Properties

When a class property uses a class-level generic template (e.g. `@var array<int, T> $items`), TypePHP automatically substitutes `T` with the object instance's dynamically bound generic type!

<TypePHPSnippet title="Generic Template Properties" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @template T
 */
class GenericHookedCollection
{
    /**
     * @var array<int, T>
     */
    public array $items = [] {
        set => $this->items = $value;
    }
}

// Bind T = positive-int to this instance
/** @var GenericHookedCollection<positive-int> */
$collection = new GenericHookedCollection();

echo "Assigning array with a negative integer...\n";
// Fails! -50 violates the bound positive-int!
$collection->items = [10, -50];
```

</TypePHPSnippet>

---

## Configuration Control

Property assignment validation is enabled by default. You can toggle property validation in your `typephp.php` configuration file under the `inline_vars` section:

```php:line-numbers
// typephp.php
return [
    'inline_vars' => [
        'properties' => true, // Set to false to disable property assignment checks
    ],
];
```
