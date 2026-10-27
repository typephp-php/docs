# Primitives & Scalars

TypePHP provides runtime enforcement for all native PHP primitives, literal scalar values, integer refinements, string refinements, class-string subtypes, float constraints, resources, and special return control types.

---

## Strict Non-Coercion Policy (Zero Type Juggling)

In standard PHP execution without `declare(strict_types=1);`, the Zend Engine aggressively juggles scalar types (converting numeric strings like `'42'` to `int`, or truthy integers like `1` to `bool`).

**TypePHP enforces a strict Zero-Coercion Policy at runtime:**

* **Strings are NEVER coerced to numbers:** Passing `'42'` into `int` or `positive-int` triggers an immediate `TypeError`.
* **Numbers are NEVER coerced to booleans:** Passing `1` or `0` into `bool`, `true`, or `false` triggers an immediate `TypeError`.
* **Booleans are NEVER coerced to strings:** Passing `true` into `string` or `non-empty-string` triggers an immediate `TypeError`.

### The Single Standard Exception: Whole Integer to Float Widening

To remain 100% faithful to the native PHP language specification, TypePHP allows **whole integers to satisfy `float` contracts**.

Even under native PHP's strictest mode (`declare(strict_types=1);`), the Zend Engine allows passing an `int` into a parameter expecting `float` (e.g. passing `10` into `float $rate` widens losslessly to `10.0` in C memory) [1]. TypePHP adopts this exact widening behavior while strictly rejecting reverse coercion (`float` into `int` is always rejected).

Because TypePHP's exceptions extend PHP's native `\TypeError` [1], you can catch all contract failures using standard native PHP error handling without importing any custom classes:

<TypePHPSnippet title="Strict Non-Coercion & Int-to-Float Widening" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param int $id
 * @param float $rate
 * @param bool $active
 */
function configureMetric($id, $rate, $active): void
{
    echo "✓ Success: ID={$id}, Rate={$rate}, Active=" . ($active ? 'true' : 'false') . "\n";
}

// 1. Valid Call: Whole int 10 is allowed for float (PHP standard widening)
configureMetric(101, 10, true);

// 2. Coercion Attempt: Passing numeric string '101' into int
try {
    configureMetric('101', 10.5, true);
} catch (\TypeError $e) {
    echo "✗ Rejected string -> int coercion:\n   " . $e->getMessage() . "\n";
}

// 3. Coercion Attempt: Passing integer 1 into bool
try {
    configureMetric(101, 10.5, 1);
} catch (\TypeError $e) {
    echo "✗ Rejected int -> bool coercion:\n   " . $e->getMessage() . "\n";
}

// 4. Coercion Attempt: Passing float 10.5 into int (no lossy truncation)
try {
    configureMetric(10.5, 10.5, true);
} catch (\TypeError $e) {
    echo "✗ Rejected float -> int coercion:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Exact Scalar Literals & Float Epsilon Tolerance

TypePHP supports enforcing exact literal scalar values in DocBlock types (`'active'`, `42`, `3.14`, `true`, `false`).

Furthermore, because floating-point calculations like `0.1 + 0.2` compute to `0.30000000000000004` under IEEE 754 representation, TypePHP compares float literals using an **Epsilon Tolerance (`1e-9`)** to prevent false-positive crashes on microscopic rounding errors:

<TypePHPSnippet title="Exact Literals & Float Epsilon Tolerance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param 'active'|'pending' $status
 * @param 200|201 $statusCode
 * @param true $requireTls
 * @param 0.3 $threshold
 */
function establishConnection(string $status, int $statusCode, bool $requireTls, float $threshold): void
{
    echo "✓ Connected: Status='{$status}', Code={$statusCode}, Threshold={$threshold}\n";
}

// 1. Valid Call (0.1 + 0.2 satisfies 0.3 via 1e-9 epsilon tolerance)
establishConnection('active', 200, true, 0.1 + 0.2);

// 2. Invalid String Literal
try {
    establishConnection('archived', 200, true, 0.3);
} catch (\TypeError $e) {
    echo "✗ Caught invalid string literal:\n   " . $e->getMessage() . "\n";
}

// 3. Invalid Integer Literal
try {
    establishConnection('active', 500, true, 0.3);
} catch (\TypeError $e) {
    echo "✗ Caught invalid integer literal:\n   " . $e->getMessage() . "\n";
}

// 4. Invalid Boolean Literal (false passed where true is required)
try {
    establishConnection('active', 200, false, 0.3);
} catch (\TypeError $e) {
    echo "✗ Caught invalid boolean literal:\n   " . $e->getMessage() . "\n";
}

// 5. Invalid Float Literal (Genuine deviation beyond epsilon)
try {
    establishConnection('active', 200, true, 0.35);
} catch (\TypeError $e) {
    echo "✗ Caught deviating float literal:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Integer Refinements & Bounded Ranges

TypePHP provides strict enforcement for all integer refinement subtypes and range expressions:

| Keyword / Syntax | Mathematical Rule | Valid Examples | Invalid Examples |
| :--- | :--- | :--- | :--- |
| **`positive-int`** | $n > 0$ | `1`, `42`, `100` | `0`, `-5` |
| **`negative-int`** | $n < 0$ | `-1`, `-42` | `0`, `5` |
| **`non-positive-int`** | $n \le 0$ | `0`, `-1`, `-10` | `1`, `5` |
| **`non-negative-int`** | $n \ge 0$ | `0`, `1`, `100` | `-1`, `-5` |
| **`non-zero-int`** | $n \ne 0$ | `1`, `-1`, `100` | `0` |
| **`unsigned-int`** | $n \ge 0$ | `0`, `10`, `50` | `-10` |
| **`int<min, max>`** | $\text{min} \le n \le \text{max}$ | `int<1, 100>` (e.g. `50`) | `0`, `101` |
| **`int<0, max>`** | $n \ge 0$ | `0`, `500` | `-1` |

<TypePHPSnippet title="Integer Refinements & Bounded Ranges" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class IntegerChecker
{
    /**
     * @param positive-int $pos
     * @param negative-int $neg
     * @param non-positive-int $nonPos
     * @param non-negative-int $nonNeg
     * @param non-zero-int $nonZero
     * @param unsigned-int $unsigned
     * @param int<1, 100> $range
     */
    public function verifyAll(
        int $pos,
        int $neg,
        int $nonPos,
        int $nonNeg,
        int $nonZero,
        int $unsigned,
        int $range
    ): void {
        echo "✓ All 7 integer refinements satisfied!\n";
    }
}

$checker = new IntegerChecker();

// 1. Happy Path: All integer bounds satisfied
$checker->verifyAll(
    pos: 42,
    neg: -10,
    nonPos: 0,
    nonNeg: 0,
    nonZero: 5,
    unsigned: 100,
    range: 50
);

// 2. Test positive-int boundary (0 is not positive)
try {
    $checker->verifyAll(0, -10, 0, 0, 5, 100, 50);
} catch (\TypeError $e) {
    echo "✗ positive-int check:\n   " . $e->getMessage() . "\n";
}

// 3. Test negative-int boundary (0 is not negative)
try {
    $checker->verifyAll(42, 0, 0, 0, 5, 100, 50);
} catch (\TypeError $e) {
    echo "✗ negative-int check:\n   " . $e->getMessage() . "\n";
}

// 4. Test non-positive-int boundary (5 is positive)
try {
    $checker->verifyAll(42, -10, 5, 0, 5, 100, 50);
} catch (\TypeError $e) {
    echo "✗ non-positive-int check:\n   " . $e->getMessage() . "\n";
}

// 5. Test non-negative-int boundary (-1 is negative)
try {
    $checker->verifyAll(42, -10, 0, -1, 5, 100, 50);
} catch (\TypeError $e) {
    echo "✗ non-negative-int check:\n   " . $e->getMessage() . "\n";
}

// 6. Test non-zero-int boundary (0 given)
try {
    $checker->verifyAll(42, -10, 0, 0, 0, 100, 50);
} catch (\TypeError $e) {
    echo "✗ non-zero-int check:\n   " . $e->getMessage() . "\n";
}

// 7. Test unsigned-int boundary (-50 is signed negative)
try {
    $checker->verifyAll(42, -10, 0, 0, 5, -50, 50);
} catch (\TypeError $e) {
    echo "✗ unsigned-int check:\n   " . $e->getMessage() . "\n";
}

// 8. Test int<1, 100> range boundaries (150 > 100)
try {
    $checker->verifyAll(42, -10, 0, 0, 5, 100, 150);
} catch (\TypeError $e) {
    echo "✗ int<1, 100> range check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Integer Bitmasks (`int-mask<...>` & `int-mask-of<...>`)

TypePHP validates bitwise flag combinations created by bitwise `OR` (`|`) operations on integers:

* **`int-mask<1, 2, 4>`:** Value must be a valid bitwise combination of the explicitly specified integers (or `0`).
* **`int-mask-of<self::FLAG_*>`:** Value must be a valid bitwise combination of class constants or enum cases matching the wildcard prefix.

<TypePHPSnippet title="Integer Bitmasks (int-mask & int-mask-of)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class FilePermission
{
    public const PERM_READ = 1;    // 0001
    public const PERM_WRITE = 2;   // 0010
    public const PERM_EXEC = 4;    // 0100

    /**
     * @param int-mask<1, 2, 4> $numericMask
     * @param int-mask-of<self::PERM_*> $constantMask
     */
    public static function apply(int $numericMask, int $constantMask): void
    {
        echo "✓ Permissions Applied: Numeric={$numericMask}, Constant={$constantMask}\n";
    }
}

// 1. Valid Combinations:
// 3 = READ | WRITE (1 | 2)
// 7 = READ | WRITE | EXEC (1 | 2 | 4)
// 0 is always allowed as an empty mask
FilePermission::apply(3, FilePermission::PERM_READ | FilePermission::PERM_EXEC);
FilePermission::apply(0, 0);

// 2. Invalid numeric bitmask: 8 (01000) is outside allowed flags (1 | 2 | 4 = 7)
try {
    FilePermission::apply(8, 3);
} catch (\TypeError $e) {
    echo "✗ Invalid numeric bitmask check:\n   " . $e->getMessage() . "\n";
}

// 3. Invalid constant bitmask: 16 is outside self::PERM_* combinations
try {
    FilePermission::apply(3, 16);
} catch (\TypeError $e) {
    echo "✗ Invalid constant bitmask check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## String Refinements

Validate string lengths, casing, formatting, and boolean truthiness:

| Refinement Keyword | Constraint Rule | Valid Examples | Invalid Examples |
| :--- | :--- | :--- | :--- |
| **`non-empty-string`** | String length > 0 | `'hello'`, `'1'` | `''` (empty string) |
| **`numeric-string`** | `is_numeric($val) === true` | `'123'`, `'45.67'`, `'-10'` | `'abc'`, `''` |
| **`lowercase-string`** | `strtolower($val) === $val` | `'hello'`, `'user_100'` | `'Hello'`, `'ADMIN'` |
| **`non-empty-lowercase-string`** | Non-empty & lowercase | `'hello'`, `'abc'` | `''`, `'Hello'` |
| **`uppercase-string`** | `strtoupper($val) === $val` | `'USD'`, `'HELLO_100'` | `'Hello'`, `'admin'` |
| **`non-empty-uppercase-string`** | Non-empty & uppercase | `'EUR'`, `'ABC'` | `''`, `'Eur'` |
| **`array-key`** | `is_int($val) \|\| is_string($val)` | `100`, `'user_100'` | `true`, `[]`, `null` |
| **`literal-string`** | Native string scalar | `'active'`, `'user'` | Numbers, Objects |
| **`truthy-string`** | String evaluates to `true` | `'hello'`, `'1'` | `''`, `'0'` |

<TypePHPSnippet title="String Refinements Validation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class StringValidator
{
    /**
     * @param non-empty-string $nonEmpty
     * @param numeric-string $numeric
     * @param lowercase-string $lower
     * @param non-empty-lowercase-string $nonEmptyLower
     * @param uppercase-string $upper
     * @param non-empty-uppercase-string $nonEmptyUpper
     * @param array-key $key
     * @param truthy-string $truthy
     */
    public function verifyStrings(
        string $nonEmpty,
        string $numeric,
        string $lower,
        string $nonEmptyLower,
        string $upper,
        string $nonEmptyUpper,
        int|string $key,
        string $truthy
    ): void {
        echo "✓ All string refinements satisfied!\n";
    }
}

$validator = new StringValidator();

// 1. Happy Path: All string contracts satisfied
$validator->verifyStrings(
    nonEmpty: 'Title',
    numeric: '149.99',
    lower: 'slug_title',
    nonEmptyLower: 'active',
    upper: 'USD',
    nonEmptyUpper: 'EUR',
    key: 'user_101',
    truthy: 'yes'
);

// 2. Test non-empty-string (empty string given)
try {
    $validator->verifyStrings('', '100', 'a', 'a', 'A', 'A', 'k', '1');
} catch (\TypeError $e) {
    echo "✗ non-empty-string check:\n   " . $e->getMessage() . "\n";
}

// 3. Test numeric-string ('abc' is non-numeric)
try {
    $validator->verifyStrings('Title', 'abc', 'a', 'a', 'A', 'A', 'k', '1');
} catch (\TypeError $e) {
    echo "✗ numeric-string check:\n   " . $e->getMessage() . "\n";
}

// 4. Test non-empty-lowercase-string ('User' has uppercase)
try {
    $validator->verifyStrings('Title', '100', 'a', 'User', 'A', 'A', 'k', '1');
} catch (\TypeError $e) {
    echo "✗ non-empty-lowercase-string check:\n   " . $e->getMessage() . "\n";
}

// 5. Test non-empty-uppercase-string ('usd' has lowercase)
try {
    $validator->verifyStrings('Title', '100', 'a', 'a', 'A', 'usd', 'k', '1');
} catch (\TypeError $e) {
    echo "✗ non-empty-uppercase-string check:\n   " . $e->getMessage() . "\n";
}

// 6. Test truthy-string ('0' evaluates to false in PHP boolean context)
try {
    $validator->verifyStrings('Title', '100', 'a', 'a', 'A', 'A', 'k', '0');
} catch (\TypeError $e) {
    echo "✗ truthy-string check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Class-String Subtypes & Generics (`class-string<T>`)

Enforce that string parameters contain valid class, interface, trait, or enum references, with optional upper bounds (`class-string<T>`):

| Keyword | Validation Rule | Valid Examples | Invalid Examples |
| :--- | :--- | :--- | :--- |
| **`class-string`** | Syntactically valid class that exists in runtime | `User::class`, `stdClass::class` | `'NonExistentClass'` |
| **`class-string<T>`** | Valid class-string that extends or implements `T` | `Dog::class` for `class-string<Animal>` | `Car::class` for `class-string<Animal>` |
| **`interface-string`** | `interface_exists($val) === true` | `DateTimeInterface::class` | `stdClass::class` |
| **`trait-string`** | `trait_exists($val) === true` | `LoggerTrait::class` | `stdClass::class` |
| **`enum-string`** | `enum_exists($val) === true` | `StatusEnum::class` | `stdClass::class` |

<TypePHPSnippet title="Class-String Subtypes & Generics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface RepositoryInterface {}
class UserRepository implements RepositoryInterface {}
class OrderRepository implements RepositoryInterface {}
class UnrelatedHelper {}

trait IdentifiableTrait {}
enum UserRole { case ADMIN; }

class ClassStringTester
{
    /**
     * @param class-string $anyClass
     * @param interface-string $iface
     * @param trait-string $trait
     * @param enum-string $enum
     * @param class-string<RepositoryInterface> $repo
     */
    public function verifyClassStrings(
        string $anyClass,
        string $iface,
        string $trait,
        string $enum,
        string $repo
    ): void {
        echo "✓ All class-string specifications verified!\n";
    }
}

$tester = new ClassStringTester();

// 1. Happy Path: All class-string types satisfied
$tester->verifyClassStrings(
    anyClass: stdClass::class,
    iface: RepositoryInterface::class,
    trait: IdentifiableTrait::class,
    enum: UserRole::class,
    repo: UserRepository::class
);

// 2. Test class-string with non-existent class
try {
    $tester->verifyClassStrings('App\\NonExistentClass', RepositoryInterface::class, IdentifiableTrait::class, UserRole::class, UserRepository::class);
} catch (\TypeError $e) {
    echo "✗ class-string existence check:\n   " . $e->getMessage() . "\n";
}

// 3. Test interface-string with class name
try {
    $tester->verifyClassStrings(stdClass::class, stdClass::class, IdentifiableTrait::class, UserRole::class, UserRepository::class);
} catch (\TypeError $e) {
    echo "✗ interface-string check:\n   " . $e->getMessage() . "\n";
}

// 4. Test trait-string with interface name
try {
    $tester->verifyClassStrings(stdClass::class, RepositoryInterface::class, RepositoryInterface::class, UserRole::class, UserRepository::class);
} catch (\TypeError $e) {
    echo "✗ trait-string check:\n   " . $e->getMessage() . "\n";
}

// 5. Test enum-string with class name
try {
    $tester->verifyClassStrings(stdClass::class, RepositoryInterface::class, IdentifiableTrait::class, stdClass::class, UserRepository::class);
} catch (\TypeError $e) {
    echo "✗ enum-string check:\n   " . $e->getMessage() . "\n";
}

// 6. Test class-string<T> bound (UnrelatedHelper does not implement RepositoryInterface)
try {
    $tester->verifyClassStrings(stdClass::class, RepositoryInterface::class, IdentifiableTrait::class, UserRole::class, UnrelatedHelper::class);
} catch (\TypeError $e) {
    echo "✗ class-string<T> upper bound check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Float Refinements

TypePHP enforces signs and bounds on floating-point parameters (and note that whole integers widen losslessly to float):

| Refinement Keyword | Constraint Rule | Valid Examples | Invalid Examples |
| :--- | :--- | :--- | :--- |
| **`positive-float`** | Float > 0.0 | `12.34`, `0.01`, `5` | `0.0`, `-5.5` |
| **`negative-float`** | Float < 0.0 | `-12.34`, `-0.01`, `-5` | `0.0`, `5.5` |
| **`non-positive-float`** | Float <= 0.0 | `0.0`, `-1.5` | `1.5`, `10` |
| **`non-negative-float`** | Float >= 0.0 | `0.0`, `1.5`, `10` | `-1.5`, `-5` |
| **`non-zero-float`** | Float != 0.0 | `1.5`, `-1.5`, `5` | `0.0`, `0` |

<TypePHPSnippet title="Float Refinements & Boundaries" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class FloatChecker
{
    /**
     * @param positive-float $pos
     * @param negative-float $neg
     * @param non-positive-float $nonPos
     * @param non-negative-float $nonNeg
     * @param non-zero-float $nonZero
     */
    public function verifyFloats(
        float $pos,
        float $neg,
        float $nonPos,
        float $nonNeg,
        float $nonZero
    ): void {
        echo "✓ All 5 float refinements satisfied!\n";
    }
}

$checker = new FloatChecker();

// 1. Happy Path: All float refinements satisfied (including whole int widening)
$checker->verifyFloats(
    pos: 0.0825,
    neg: -15.50,
    nonPos: 0.0,
    nonNeg: 10, // whole integer widens cleanly
    nonZero: -1.2
);

// 2. Test positive-float (0.0 is not strictly positive)
try {
    $checker->verifyFloats(0.0, -15.5, 0.0, 1.0, 1.0);
} catch (\TypeError $e) {
    echo "✗ positive-float check:\n   " . $e->getMessage() . "\n";
}

// 3. Test negative-float (0.0 is not strictly negative)
try {
    $checker->verifyFloats(1.0, 0.0, 0.0, 1.0, 1.0);
} catch (\TypeError $e) {
    echo "✗ negative-float check:\n   " . $e->getMessage() . "\n";
}

// 4. Test non-positive-float (1.5 is positive)
try {
    $checker->verifyFloats(1.0, -1.0, 1.5, 1.0, 1.0);
} catch (\TypeError $e) {
    echo "✗ non-positive-float check:\n   " . $e->getMessage() . "\n";
}

// 5. Test non-negative-float (-1.5 is negative)
try {
    $checker->verifyFloats(1.0, -1.0, 0.0, -1.5, 1.0);
} catch (\TypeError $e) {
    echo "✗ non-negative-float check:\n   " . $e->getMessage() . "\n";
}

// 6. Test non-zero-float (0.0 is zero)
try {
    $checker->verifyFloats(1.0, -1.0, 0.0, 1.0, 0.0);
} catch (\TypeError $e) {
    echo "✗ non-zero-float check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Truthiness, Numeric Types, Resources & Control Returns

Validate boolean truthiness, generic numeric types, open/closed stream resources, and exit control types (`void` and `never`):

| Keyword | Validation Rule | Valid Examples | Invalid Examples |
| :--- | :--- | :--- | :--- |
| **`truthy`** | Evaluates to `true` in boolean context | `'hello'`, `1`, `[1]`, `true` | `0`, `''`, `null`, `false` |
| **`falsy`**, **`falsey`** | Evaluates to `false` in boolean context | `0`, `''`, `null`, `false`, `[]` | `'hello'`, `1`, `true` |
| **`numeric`**, **`number`** | Integer, Float, or Numeric String | `10`, `12.34`, `'99.9'` | `'abc'`, `null` |
| **`open-resource`**, **`resource`** | `is_resource($val) === true` | `fopen('php://memory', 'r')` | Closed stream, String |
| **`closed-resource`** | Handle closed via `fclose($fp)` | Closed stream handle | Open stream, String |
| **`never`** | Function never returns normally | Throws exception or `exit()` | Returns any value |

<TypePHPSnippet title="Truthiness, Numeric, Resources & never" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class SpecialTypeTester
{
    /**
     * @param truthy $truthy
     * @param falsy $falsy
     * @param numeric $num
     * @param open-resource $openRes
     * @param closed-resource $closedRes
     */
    public function verifySpecials(mixed $truthy, mixed $falsy, mixed $num, $openRes, $closedRes): void
    {
        echo "✓ Special types verified!\n";
    }

    /**
     * @return never
     */
    public function haltService(): string
    {
        return 'unexpected_return'; // Violates never!
    }
}

$tester = new SpecialTypeTester();

$openFp = fopen('php://memory', 'r+');
$closedFp = fopen('php://memory', 'r+');
fclose($closedFp);

// 1. Happy Path: All special types satisfied
$tester->verifySpecials(
    truthy: 'enabled',
    falsy: '',
    num: '199.95',
    openRes: $openFp,
    closedRes: $closedFp
);
fclose($openFp);

// 2. Test truthy (empty string is falsy)
try {
    $dummy = fopen('php://memory', 'r+');
    $closed = fopen('php://memory', 'r+');
    fclose($closed);
    $tester->verifySpecials('', '', '10', $dummy, $closed);
} catch (\TypeError $e) {
    echo "✗ truthy check:\n   " . $e->getMessage() . "\n";
} finally {
    if (isset($dummy) && is_resource($dummy)) fclose($dummy);
}

// 3. Test numeric ('abc' is not numeric)
try {
    $dummy = fopen('php://memory', 'r+');
    $closed = fopen('php://memory', 'r+');
    fclose($closed);
    $tester->verifySpecials('ok', '', 'abc', $dummy, $closed);
} catch (\TypeError $e) {
    echo "✗ numeric check:\n   " . $e->getMessage() . "\n";
} finally {
    if (isset($dummy) && is_resource($dummy)) fclose($dummy);
}

// 4. Test open-resource (passing closed handle)
try {
    $closed = fopen('php://memory', 'r+');
    fclose($closed);
    $tester->verifySpecials('ok', '', '10', $closed, $closed);
} catch (\TypeError $e) {
    echo "✗ open-resource check:\n   " . $e->getMessage() . "\n";
}

// 5. Test @return never contract failure (method returned instead of throwing)
try {
    $tester->haltService();
} catch (\TypeError $e) {
    echo "✗ never return contract check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>