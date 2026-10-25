# Compile-Time Check Elimination

A common concern with runtime type enforcement is performance overhead. If every return statement, variable assignment, and property initialization were blindly wrapped in runtime assertions, high-frequency functions and tight loops would suffer from unnecessary Zend VM function-call overhead.

TypePHP solves this with **Compile-Time Check Elimination** (`eliminate_statically_proven_checks => true`). During file transformation, TypePHP analyzes AST expressions against declared DocBlock contracts. If an expression is mathematically, logically, or syntactically proven to satisfy its contract, **TypePHP completely skips injecting runtime assertion wrappers for that statement**.

---

## The Performance Difference: Before vs. After

Consider a standard getter method returning a string literal:

```php:line-numbers
/** @return non-empty-string */
public function getVersion(): string
{
    return '2.0.0';
}
```

### Without Elimination (Standard Runtime Wrapping)

```php:line-numbers
return ($__typephpRet = \TypePHP\Internal\RuntimeTypeChecker::checkReturn(__METHOD__, '2.0.0', $this)) instanceof \TypePHP\Internal\Diagnostic\ErrorMessage 
    ? throw ... 
    : $__typephpRet;
```

- Pushes arguments to the VM stack $\rightarrow$ invokes `RuntimeTypeChecker::checkReturn()`.
- Looks up function contract in memory $\rightarrow$ validates string length > 0.
- Executes `T_INSTANCEOF` $\rightarrow$ evaluates ternary branch.
- **Cost:** ~50 Zend VM opcodes and stack frame allocations on **every single call**.

### With Compile-Time Elimination (TypePHP Optimization)

Because `'2.0.0'` is proven to be a `non-empty-string` at compile time, TypePHP emits clean, unmodified PHP code:

```php:line-numbers
return '2.0.0';
```

- **Cost:** **1 single Zend VM opcode (`ZEND_RETURN`)**.
- **Execution Speed:** Runs at **100% native PHP C-speed** (~15–30M calls/sec).
- **JIT Inlining Synergy:** Because there are no dynamic wrapper calls or exception branches, PHP 8's Tracing JIT compiler can inline the getter directly into caller machine code.

---

## Interactive Demo: Inspecting Transformed Source Code

Click the **Transformed** button in any of the snippets below to inspect how TypePHP compiles the code. Notice that statements with proven literals, shapes, constants, or variables have **zero assertion wrappers injected**, while dynamic expressions maintain runtime protection.

---

## Scalars, Numbers & Arithmetic Expressions

`ScalarEvaluator` and `ArithmeticEvaluator` analyze scalar literals, constants, string prefixes, and folded arithmetic expressions. Operations like `60 * 60` or `"user_" . $id` are evaluated statically:

<TypePHPSnippet title="Scalar & Arithmetic Compile-Time Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

class CacheConfig
{
    /** @return positive-int */
    public function getTtl(): int
    {
        // 60 * 60 is folded to 3600 at compile time -> Proven positive-int -> Check omitted!
        return 60 * 60;
    }

    /** @return non-empty-string */
    public function generateCacheKey(int $id): string
    {
        // String with non-empty prefix 'item_' guaranteed length >= 5 -> Check omitted!
        return 'item_' . $id;
    }

    /** @return int<1, 100> */
    public function getValidPercentage(): int
    {
        // 50 statically satisfies range 1..100 -> Check omitted!
        return 50;
    }

    /** @return positive-int */
    public function calculateDynamicTtl(int $multiplier): int
    {
        // Dynamic variable multiplication -> Unverifiable at compile time -> Preserves runtime check!
        return $multiplier * 10;
    }
}

$config = new CacheConfig();
echo "TTL: " . $config->getTtl() . "\n";
echo "Dynamic TTL: " . $config->calculateDynamicTtl(5) . "\n";
```

</TypePHPSnippet>

---

## Class Constants, Wildcards & Enums

`ConstantAndEnumEvaluator` statically inspects class constants, wildcard patterns (`Class::PREFIX_*`), and PHP 8.1+ Enum cases and backing values:

<TypePHPSnippet title="Constant & Enum Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

enum TransactionStatus: string
{
    case PENDING = 'pending';
    case COMPLETED = 'completed';
    case FAILED = 'failed';
}

class PaymentGateway
{
    public const MODE_TEST = 'test_mode';
    public const MODE_LIVE = 'live_mode';

    /**
     * @return self::MODE_*
     */
    public function getDefaultMode(): string
    {
        // Matches wildcard self::MODE_* at compile time -> Check omitted!
        return self::MODE_TEST;
    }

    /**
     * @return TransactionStatus
     */
    public function getInitialStatus(): TransactionStatus
    {
        // Exact enum case -> Matches contract -> Check omitted!
        return TransactionStatus::PENDING;
    }

    /**
     * @return value-of<TransactionStatus>
     */
    public function getInitialStatusValue(): string
    {
        // Backing value 'pending' is a proven value-of -> Check omitted!
        return TransactionStatus::PENDING->value;
    }
}

$gateway = new PaymentGateway();
echo "Default Mode: " . $gateway->getDefaultMode() . "\n";
echo "Status: " . $gateway->getInitialStatus()->value . "\n";
```

</TypePHPSnippet>

---

## Literal Arrays, Lists & Shapes

`ArrayLiteralEvaluator` recursively inspects array structures. If every key and element expression in an array is statically proven, TypePHP skips injecting collection loops and shape assertion wrappers:

<TypePHPSnippet title="Array Literal, List & Shape Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

class DatabaseRegistry
{
    /**
     * @return list<positive-int>
     */
    public function getStandardPorts(): array
    {
        // Sequential 0..2 integer keys, all items positive-int -> Check omitted!
        return [3306, 5432, 6379];
    }

    /**
     * @return array{host: non-empty-string, port: positive-int, ssl: bool}
     */
    public function getDefaultConfig(): array
    {
        // All required keys present and proven valid -> Check omitted!
        return [
            'host' => '127.0.0.1',
            'port' => 3306,
            'ssl' => true,
        ];
    }

    /**
     * @return list<string>
     */
    public function getEmptyList(): array
    {
        // Empty array [] is an empty list -> Check omitted!
        return [];
    }

    /**
     * @return list<int>
     */
    public function getDynamicList(int $customPort): array
    {
        // Contains dynamic variable $customPort -> Preserves runtime check!
        return [3306, $customPort];
    }
}

$registry = new DatabaseRegistry();
print_r($registry->getDefaultConfig());
```

</TypePHPSnippet>

---

## Local Typed Variables (`@var`) & Assignments

Compile-time check elimination applies directly to local variable assignments and destructuring. When a variable is initialized with a proven literal, TypePHP emits a raw `$x = ...;` assignment without injecting `RuntimeTypeChecker::checkVariable()`:

<TypePHPSnippet title="Typed Variable (@var) Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

// 1. Literal scalar: 100 is positive-int -> Check omitted! (Emits: $score = 100;)
/** @var positive-int $score */
$score = 100;
echo "Score: {$score}\n";

// 2. Literal shape: All keys proven -> Check omitted!
/** @var array{id: positive-int, tag: non-empty-string} $metadata */
$metadata = [
    'id' => 1,
    'tag' => 'ACTIVE',
];
echo "Metadata ID: {$metadata['id']}\n";

// 3. Dynamic assignment: rand() is dynamic -> Injects runtime check!
/** @var positive-int $dynamicValue */
$dynamicValue = rand(1, 10);
echo "Dynamic Value: {$dynamicValue}\n";
```

</TypePHPSnippet>

---

## Object Instantiations & Identity Returns (`$this`, `new static`)

`ObjectEvaluator` statically handles exact class instantiations and strict object identity:

<TypePHPSnippet title="Object & $this Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

class User
{
    public function __construct(public string $name) {}
}

class UserFactory
{
    private bool $active = false;

    /**
     * @return User
     */
    public function createDefaultUser(): User
    {
        // Exact FQCN match -> Guaranteed User instance -> Check omitted!
        return new User('Default');
    }

    /**
     * @return $this
     */
    public function activate(): self
    {
        $this->active = true;

        // $this === $this is an identity truth -> Check omitted!
        // Fluent builders execute with zero wrapper overhead!
        return $this;
    }
}

$factory = new UserFactory();
$user = $factory->activate()->createDefaultUser();
echo "Created User: {$user->name}\n";
```

</TypePHPSnippet>

---

## Preceding Local Assignment Propagation

TypePHP tracks immediate predecessor local variable assignments within function bodies. If a local variable was just assigned a proven literal, returning that variable benefits from compile-time elimination:

<TypePHPSnippet title="Preceding Assignment Propagation" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

class SessionManager
{
    /**
     * @return non-empty-string
     */
    public function getAuthToken(): string
    {
        /** @var non-empty-string */
        $token = 'sess_token_98765'; // Proven valid literal

        // Preceding assignment proved $token is non-empty-string -> Check omitted!
        return $token;
    }
}

$sm = new SessionManager();
echo "Token: " . $sm->getAuthToken() . "\n";
```

</TypePHPSnippet>

---

## Generator Yield & Send Optimization

`GeneratorEvaluator` statically optimizes generator bodies, eliminating yield, yield from, send, and return wrappers when contracts are proven:

<TypePHPSnippet title="Generator Elimination" default-view="transformed">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @return Generator<int, positive-int, void, string>
 */
function counterStream(): Generator
{
    // Yielded keys (0, 1) and values (10, 20) are proven -> Check omitted!
    yield 0 => 10;
    yield 1 => 20;

    // Generator return value is proven non-empty-string -> Check omitted!
    return 'done';
}

$stream = counterStream();
foreach ($stream as $k => $v) {
    echo "Yielded: {$k} => {$v}\n";
}
echo "Return: " . $stream->getReturn() . "\n";
```

</TypePHPSnippet>

---

## Elimination Safety Policy (`EliminationSafetyPolicy`)

To ensure that compile-time check elimination never compromises type safety or creates false negatives, TypePHP enforces strict safety policies.

### When Class Methods Are Strictly Deferred to Runtime

Return checks on class methods are **strictly deferred to runtime** unless:
1. **The method is `private`:** Private methods cannot override parent contracts and cannot be overridden by child classes.
2. **The class has no inheritance (`hasRealInheritance === false`):** Standalone classes with no `extends`, `implements`, or `use Trait` cannot violate Liskov Substitution.
3. **Standalone Functions & Closures:** Global functions, anonymous closures, and arrow functions have zero inheritance risk and are always eligible for elimination.

All public and protected methods in classes with inheritance preserve runtime return checks to guarantee parent contracts cannot be bypassed.

### Why Reified Generic Objects Are Never Eliminated

When an expression instantiates a generic class (`new Collection([1, 2])`), TypePHP **never** eliminates the check. 

Runtime generic checks perform the critical side-effect of **stamping template bindings (`T = int`) onto the object instance in `\WeakMap` memory**. Omitting the check would prevent downstream methods (`$col->add()`) from knowing the instance's generic state!

*(Note: Generic array containers like `list<T>` and `array<K, V>` carry no object state and are fully eligible for compile-time elimination).*

---

## Summary of Statically Eliminated Scenarios

| Expression Pattern | Target Contract | Elimination Result |
| :--- | :--- | :--- |
| **Literal Scalars** | `return 42;` vs `@return positive-int`<br>`return 'admin';` vs `@return non-empty-string` | Injected check is **completely omitted**. Statement remains clean `return 'admin';`. |
| **Integer Ranges** | `return 50;` vs `@return int<1, 100>` | Evaluated statically against range bounds. Check is **omitted**. |
| **String Concatenations** | `return 'user_' . $id;` vs `@return non-empty-string` | Prefix $\ge 1$ char guarantees length $\ge 1$. Check is **omitted**. |
| **Class Constants** | `return self::MODE_TEST;` vs `@return self::MODE_*` | Constant wildcard prefix matched at compile time. Check is **omitted**. |
| **Enum Cases & Values** | `return Status::PENDING;` vs `@return Status`<br>`return Status::PENDING->value;` vs `value-of<Status>` | Case and backing values matched at compile time. Check is **omitted**. |
| **Empty Array Literals** | `return [];` vs `@return list<T>` or `array<K, V>` | In PHP, `[]` is always a valid list/array. Check is **omitted**. |
| **Sequential Lists** | `return [1, 2, 3];` vs `@return list<positive-int>` | All keys verified sequential and values satisfy contract. Check is **omitted**. |
| **Array Shapes** | `return ['id' => 1];` vs `array{id: int}` | All required keys present and values statically proven. Check is **omitted**. |
| **Exact Class Instantiations** | `return new User('Alice');` vs `@return User` | FQCN matches without reflection. Check is **omitted**. |
| **Identity Returns** | `return $this;` vs `@return $this` / `@return self`<br>`return new static();` vs `@return static` | Strict identity truth. Check is **omitted**; fluent chaining runs at native speed. |
| **Property Defaults** | `public int $timeout = 30;` vs `@var positive-int` | Default value is statically proven. **No constructor assertions synthesized.** |
| **Local `@var` Assignments** | `/** @var positive-int $x */ $x = 10;` | Emits clean `$x = 10;` without `checkVariable()` wrapper. |
| **Safe By-Ref Foreach** | `foreach ($scores as &$s) { $s += 5; }` | Post-loop container assertion is **omitted** when loop body is free of opaque mutations. |

---

## Configuration & Disabling Check Elimination

Compile-time check elimination is enabled by default (`true`). You can disable it for deep debugging, tracing every single check in stack traces, or benchmarking unoptimized AST instrumentation:

### In `typephp.php`
```php:line-numbers
return [
    'eliminate_statically_proven_checks' => false,
];
```

### In `composer.json`
```json:line-numbers
{
  "extra": {
    "typephp": {
      "eliminate-statically-proven-checks": false
    }
  }
}
```

### Via Environment Variable
```bash
export TYPEPHP_ELIMINATE_STATICALLY_PROVEN_CHECKS=false
```
