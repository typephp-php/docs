# Liskov Substitution & DocBlock Inheritance

TypePHP respects the Liskov Substitution Principle (LSP). Child classes, implemented interfaces, traits, and abstract methods automatically inherit PHPDoc type contracts without requiring you to duplicate docblock annotations.

---

## Abstract Method & Interface Contract Inheritance

When a child class implements an interface or extends an abstract parent class, it automatically inherits all `@param`, `@return`, and `@param-out` contracts declared on the ancestor methods:

<TypePHPSnippet title="Interface & Abstract Method Contract Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Services;

interface UserRepositoryInterface
{
    /**
     * Interface Contract
     *
     * @param positive-int $id
     * @return array{id: positive-int, username: non-empty-string}
     */
    public function findUser(int $id): array;
}

class UserRepository implements UserRepositoryInterface
{
    // No docblock declared here! Inherits contract from UserRepositoryInterface.
    public function findUser(int $id): array
    {
        return ['id' => $id, 'username' => 'Alice'];
    }
}

$repo = new UserRepository();

// 1. Happy Path: Valid parameter and return shape
$user = $repo->findUser(42);
echo "✓ Found user #{$user['id']}: {$user['username']}\n\n";

// 2. Failure: Parameter $id = -5 violates inherited positive-int contract
try {
    $repo->findUser(-5);
} catch (\TypeError $e) {
    echo "✗ Inherited parameter contract violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Deep Multi-Level Inheritance Chains

TypePHP recursively traverses inheritance trees down to any depth across classes, interfaces, and traits.

### 4-Level Class Inheritance (`Level 1` $\to$ `Level 2` $\to$ `Level 3` $\to$ `Level 4`)

<TypePHPSnippet title="Deep Multi-Level Class Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

abstract class DeepLevel1
{
    /**
     * Contract declared on root ancestor
     *
     * @param positive-int $id
     * @return non-empty-string
     */
    abstract public function process(int $id): string;
}

abstract class DeepLevel2 extends DeepLevel1 {}
abstract class DeepLevel3 extends DeepLevel2 {}

class DeepLevel4Executor extends DeepLevel3
{
    // Concrete implementation with NO docblock! Inherits from Level 1 root.
    public function process(int $id): string
    {
        return "item_{$id}";
    }
}

$executor = new DeepLevel4Executor();

// 1. Happy Path
echo "✓ Processed: " . $executor->process(42) . "\n\n";

// 2. Failure: $id = -50 violates Level 1 root abstract @param positive-int
try {
    $executor->process(-50);
} catch (\TypeError $e) {
    echo "✗ 4-level deep inheritance check failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

### Deep Interface Chains (`RootInterface` $\leftarrow$ `MidInterface` $\leftarrow$ `ChildInterface`)

<TypePHPSnippet title="Deep Interface Inheritance Chains" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface RootInterface
{
    /**
     * @param positive-int $code
     */
    public function execute(int $code): bool;
}

interface MidInterface extends RootInterface {}
interface ChildInterface extends MidInterface {}

class InterfaceExecutor implements ChildInterface
{
    // Implementation with NO docblock! Inherits from RootInterface.
    public function execute(int $code): bool
    {
        return true;
    }
}

$executor = new InterfaceExecutor();

// 1. Happy Path
$executor->execute(10);
echo "✓ Executed root interface contract cleanly\n\n";

// 2. Failure: $code = -10 violates RootInterface's @param positive-int
try {
    $executor->execute(-10);
} catch (\TypeError $e) {
    echo "✗ Deep interface inheritance failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## PHP 8.4 Interface Property & Hook Inheritance

In PHP 8.4, interfaces can declare property hooks (`{ get; set; }`). Implementing classes inherit property `@var` contracts directly from the interface:

<TypePHPSnippet title="PHP 8.4 Interface Property Hook Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface UserInterface
{
    /**
     * @var positive-int
     */
    public int $id { get; }

    /**
     * @var non-empty-string
     */
    public string $username { get; set; }
}

class User implements UserInterface
{
    // Inherits @var positive-int from UserInterface
    public int $id {
        get => $this->_id;
    }
    public int $_id = 10;

    // Inherits @var non-empty-string from UserInterface
    public string $username {
        get => $this->_username;
        set => $this->_username = trim($value);
    }
    public string $_username = 'Alice';
}

$user = new User();

// 1. Valid Access
echo "✓ Profile initialized: User={$user->username}, ID={$user->id}\n\n";

// 2. Invalid Read: $user->_id = -5 violates interface's inherited @var positive-int
try {
    $user->_id = -5;
    $val = $user->id;
} catch (\TypeError $e) {
    echo "✗ Interface hooked property read check:\n   " . $e->getMessage() . "\n\n";
}

// 3. Invalid Write: Empty string violates interface's inherited @var non-empty-string
try {
    $user->username = '   ';
} catch (\TypeError $e) {
    echo "✗ Interface hooked property write check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Trait Instance & Static Property Inheritance

Instance and static properties declared in Traits inherit their `@var` docblock contracts when used by a class:

<TypePHPSnippet title="Trait Instance & Static Property Inheritance" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

trait IdentifiableTrait
{
    /**
     * @var positive-int
     */
    public int $traitId = 10;

    /**
     * @var non-empty-string
     */
    public static string $traitVersion = '1.0';

    public function setTraitId(int $val): void
    {
        $this->traitId = $val;
    }

    public static function setTraitVersion(string $val): void
    {
        self::$traitVersion = $val;
    }
}

class AppModel
{
    use IdentifiableTrait;
}

$model = new AppModel();

// 1. Valid Updates
$model->setTraitId(100);
AppModel::setTraitVersion('2.0');
echo "✓ Trait properties updated: ID={$model->traitId}, Version=" . AppModel::$traitVersion . "\n\n";

// 2. Invalid Instance Property: $val = -50 violates Trait's @var positive-int
try {
    $model->setTraitId(-50);
} catch (\TypeError $e) {
    echo "✗ Trait instance property check:\n   " . $e->getMessage() . "\n\n";
}

// 3. Invalid Static Property: Empty string violates Trait's @var non-empty-string
try {
    AppModel::setTraitVersion('');
} catch (\TypeError $e) {
    echo "✗ Trait static property check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Trait Method Aliasing (`use Trait { oldMethod as newMethod; }`)

When a class uses a Trait and renames a method using PHP's trait `as` alias syntax, TypePHP inspects trait alias mappings and automatically inherits the original Trait method's DocBlock contracts onto the aliased method:

<TypePHPSnippet title="Trait Method Aliasing (as)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

trait LoggerTrait
{
    /**
     * @param positive-int $level
     * @param non-empty-string $message
     */
    public function logEvent(int $level, string $message): bool
    {
        return true;
    }
}

class AuditService
{
    use LoggerTrait {
        logEvent as recordAuditLog; // Aliases method from trait!
    }
}

$service = new AuditService();

// 1. Happy Path: Call aliased method
$service->recordAuditLog(1, 'audit_ok');
echo "✓ Successfully executed aliased trait method\n\n";

// 2. Failure: $level = -1 violates inherited Trait's @param positive-int
try {
    $service->recordAuditLog(-1, 'audit_ok');
} catch (\TypeError $e) {
    echo "✗ Aliased trait method violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Trait Conflict Resolution (`insteadof`)

When a class uses multiple traits with identical method names, PHP requires resolving the collision with `insteadof`. TypePHP respects `insteadof` precedence, enforcing contracts strictly from the selected trait:

<TypePHPSnippet title="Trait Conflict Resolution (insteadof)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

trait PrimaryLogger
{
    /**
     * @param positive-int $level
     * @param non-empty-string $message
     */
    public function log(int $level, string $message): string
    {
        return "primary: {$level} - {$message}";
    }
}

trait SecondaryLogger
{
    /**
     * @param negative-int $level
     * @param string $message
     */
    public function log(int $level, string $message): string
    {
        return "secondary: {$level} - {$message}";
    }
}

class LoggingService
{
    // PrimaryLogger::log is selected instead of SecondaryLogger
    use SecondaryLogger, PrimaryLogger {
        PrimaryLogger::log insteadof SecondaryLogger;
        SecondaryLogger::log as secondaryLog;
    }
}

$service = new LoggingService();

// 1. Primary log() enforces positive-int and non-empty-string from PrimaryLogger
echo "✓ " . $service->log(10, 'server_boot') . "\n";

// 2. Aliased secondaryLog() enforces negative-int from SecondaryLogger
echo "✓ " . $service->secondaryLog(-20, 'server_shutdown') . "\n\n";

// 3. Passing negative integer to primary log() triggers TypeError
try {
    $service->log(-5, 'server_boot');
} catch (\TypeError $e) {
    echo "✗ Primary trait conflict check:\n   " . $e->getMessage() . "\n\n";
}

// 4. Passing positive integer to secondaryLog() triggers TypeError
try {
    $service->secondaryLog(20, 'server_shutdown');
} catch (\TypeError $e) {
    echo "✗ Secondary trait conflict check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Partial Parameter Overriding (Gap-Filling)

If a child class overrides a method and provides a docblock for **only some** parameters, TypePHP fills in the missing parameter contracts from the parent class or interface:

<TypePHPSnippet title="Partial Parameter Overriding (Gap-Filling)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

class BaseService
{
    /**
     * Parent defines contracts for both $id and $name
     *
     * @param positive-int $id
     * @param non-empty-string $name
     */
    public function update(int $id, string $name): bool
    {
        return true;
    }
}

class ChildService extends BaseService
{
    /**
     * Child overrides ONLY $name to restrict allowed string literals!
     * Contract for $id is inherited automatically from parent BaseService.
     *
     * @param 'Alice'|'Bob' $name
     */
    public function update(int $id, string $name): bool
    {
        return true;
    }
}

$service = new ChildService();

// 1. Happy Path: Valid $id and valid restricted $name
$service->update(10, 'Alice');
echo "✓ Updated user with valid ID and name\n\n";

// 2. Failure: Invalid $id (-5 violates parent's inherited @param positive-int)
try {
    $service->update(-5, 'Alice');
} catch (\TypeError $e) {
    echo "✗ Inherited parent gap check ($id):\n   " . $e->getMessage() . "\n\n";
}

// 3. Failure: Invalid $name ('Charlie' violates child's local @param 'Alice'|'Bob')
try {
    $service->update(10, 'Charlie');
} catch (\TypeError $e) {
    echo "✗ Local refined parameter check ($name):\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Parameter Renaming & Position Shift Disambiguation

When a child class, constructor, or trait implementation overrides an ancestor method, parameter positions may shift when new parameters are inserted, or parameter names may be renamed.

TypePHP resolves parameter contract inheritance using **3-Tier Name & Position Disambiguation**:

1. **Name-First Matching:** If a parameter name in the child method matches a parameter name in the parent class (e.g. `$container`), the parent's contract is mapped to that parameter regardless of its position index in the child.
2. **Position Fallback on Renamed Parameters:** If a parameter is renamed in the child class (e.g. `$id` $\to$ `$userId`), TypePHP maps the contract using its position index.
3. **Candidate Disambiguation (Shift Protection):** If a child class inserts a new parameter at index 0 (shifting all subsequent parameters down), TypePHP **verifies that the candidate child parameter does not already exist in the parent under its own name**. This prevents parent parameter contracts from accidentally mis-mapping onto shifted child parameters.

<TypePHPSnippet title="Parameter Position Shift & Renaming Disambiguation" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface ContainerInterface {}
class Container implements ContainerInterface {}

class BaseRegistry
{
    /**
     * Parent constructor has 3 params:
     * Index 0: $container
     * Index 1: $definitions
     * Index 2: $repositoryMap
     *
     * @param array<string, string> $definitions
     * @param array<string, string> $repositoryMap
     */
    public function __construct(
        ContainerInterface $container,
        array $definitions,
        array $repositoryMap
    ) {}
}

class SalesChannelRegistry extends BaseRegistry
{
    /**
     * Child inserts $prefix at Index 0 (shifting $container to Index 1),
     * and renames $definitions -> $definitionMap at Index 2!
     *
     * @param array<string, string> $definitionMap
     * @param array<string, string> $repositoryMap
     */
    public function __construct(
        string $prefix,
        ContainerInterface $container,
        array $definitionMap,
        array $repositoryMap
    ) {
        parent::__construct($container, $definitionMap, $repositoryMap);
    }
}

// 1. Happy Path:
// TypePHP keeps $container (Index 1 in child) untouched rather than mis-mapping
// parent's @param array $definitions (Index 1 in parent) onto it!
new SalesChannelRegistry(
    'sales_channel.',
    new Container(),
    ['prod' => 'ProductDef'],
    ['prod' => 'ProductRepo']
);
echo "✓ Position shift disambiguation succeeded with no false-positive mis-mapping!\n\n";

// 2. Failure: Passing invalid non-string value in $definitionMap
try {
    new SalesChannelRegistry(
        'sales_channel.',
        new Container(),
        ['prod' => 12345], // Invalid: value must be string
        ['prod' => 'ProductRepo']
    );
} catch (\TypeError $e) {
    echo "✗ Target parameter validation check:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Trait & Interface Contract Fusion

When a class implements an Interface and fulfills its methods by using a Trait:

<TypePHPSnippet title="Trait & Interface Contract Fusion" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

interface ExecutorInterface
{
    /**
     * @param positive-int $code
     * @return non-empty-string
     */
    public function execute(int $code): string;
}

trait ExecutorTrait
{
    // Trait method fulfills the Interface with NO docblock
    public function execute(int $code): string
    {
        return "code_{$code}";
    }
}

class AppExecutor implements ExecutorInterface
{
    use ExecutorTrait; // Trait method fulfills Interface contract
}

$app = new AppExecutor();

// 1. Happy Path
echo "✓ Executed: " . $app->execute(42) . "\n\n";

// 2. Failure: $code = -5 violates ExecutorInterface's @param positive-int
try {
    $app->execute(-5);
} catch (\TypeError $e) {
    echo "✗ Interface contract fusion failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## In-Memory Inheritance Caching Performance

To ensure that resolving complex inheritance chains introduces zero perceptible latency, TypePHP uses a **3-tier in-memory static caching architecture**:

1. **End-Result Contract Cache (`ContractParser::$cache`):** Caches the fully resolved parameter, return, template, and alias metadata per method string (e.g. `"UserRepository::find"`).
2. **Reflection Hierarchy Cache (`HierarchyResolver`):** Caches the class, parent, interface, and trait Reflection tree (`[Child, Parent, GrandParent, Interface1, Interface2]`). If a class has 20 methods, its inheritance tree is inspected **only once**.
3. **Property Contract Cache (`ContractParser::$propertyCache`):** Caches resolved property `@var` types (`"UserProfile::$id"`).

### How It Executes at Runtime

When you call `$userRepo->find(42)` 1,000 times in a loop:
* **Invocation #1:** TypePHP builds the `UserRepository` inheritance tree, parses the docblocks, merges parent gaps, and caches the resolved contract in static RAM.
* **Invocations #2 through #1,000:** TypePHP fetches the pre-resolved contract directly from static RAM in **$O(1)$ constant nanoseconds**—zero Reflection traversal occurs!

---

## Vendor DocBlock Isolation

TypePHP protects your application from third-party vendor docblock bugs using **Vendor Isolation**:

* If a parent class or interface is located inside an excluded folder (such as `/vendor/`), TypePHP **ignores its inherited docblocks**.
* This prevents third-party package docblock errors or outdated annotations from causing unexpected `TypeError` exceptions in your application code.
