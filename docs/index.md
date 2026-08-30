---
layout: home

hero:
  name: "TypePHP"
  text: "Transparent Runtime Type Enforcement"
  tagline: "The first pure userland PHP library to transparently enforce DocBlock types at runtime. Bringing reified generics, typed arrays, and static analysis type refinements to life with zero new syntax, zero build steps, and zero C-extensions."
  actions:
    - theme: brand
      text: "Get Started →"
      link: /getting-started/installation
    - theme: alt
      text: "View on GitHub"
      link: https://github.com/typephp-php/typephp

features:
  - title: "First-of-its-Kind in Userland"
    details: "Operates 100% in pure PHP userland via native stream wrappers and AST transformations. No custom PHP binaries, C-extensions, FFI, or build steps required."
  - title: "True Reified Generics"
    details: "The only PHP engine that statefully reifies generic templates per object instance in memory using native WeakMap tracking, with full support for variance, nested generics, upper bounds, and clone preservation."
  - title: "Advanced Type Enhancements"
    details: "Enforces typed arrays, sequential lists, array shapes, DNF, scalar refinements , and key-of / value-of extractions live at runtime."
  - title: "Zero Line-Drift & Total Compatibility"
    details: "100% drop-in compatible with any existing PHP 8.1+ codebase (Laravel, Symfony, Shopware). Error traces in Ignition, Symfony, and Pest highlight the exact source line without drift."
---

::: tip The First Pure Userland Runtime Contract Engine for PHP
**You don't have to refactor a single line of code, learn new syntax, or compile C-extensions.** TypePHP bridges the gap between static analysis and runtime execution. Drop TypePHP into your existing project, and your PHPStan and Psalm DocBlocks will immediately start enforcing reified generics, typed arrays, and shape contracts the moment your code runs.
:::

## See It In Action

TypePHP operates entirely in userland using native stream wrappers and AST transformations. Because it requires no C-extensions or FFI, you can drop it into any PHP 8.1+ project or web framework effortlessly. It reads your existing PHPDoc annotations and enforces them the moment your code runs.

### Real-World Framework Guard Rails (Laravel / Symfony)
Prevent dynamic data bugs from leaking into database queries or API responses:

```php
namespace App\Models;

use App\Enums\Role;
use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    /**
     * @return list<int>
     */
    public function assignableRoles(): array
    {
        if ($this->isSuperAdmin()) {
            // Bug! Returns an array of Role Enum instances instead of integers:
            return Role::cases(); 
        }

        return [Role::STAFF->value];
    }
}

// Executing $user->assignableRoles() throws:
// TypePHP\Exception\TypeError: User::assignableRoles(): Return value[0] must be of type int, App\Enums\Role returned
```

---

### True Runtime Generics with Reified Memory State
Define generic templates and TypePHP tracks their state per object instance in memory using native `\WeakMap`:

```php
/**
 * @template T
 */
class Collection 
{
    /** @param T $item */
    public function add(mixed $item): void { /* ... */ }
}

// Prebind T = User to this specific object instance in memory
/** @var Collection<User> $users */
$users = new Collection();

$users->add(new User('Alice')); // Valid

$users->add(new Product('SKU-100')); 
// Throws TypeError: Argument $item (template T = User) must be of type User, Product given
```

---

### Array Shapes & Key/Value Extractions
Enforce strict associative array structures and constant extractions:

```php
namespace App\Services;

use App\Database\DriverManager;

/**
 * @phpstan-type ConnectionParams array{
 *     driver: key-of<DriverManager::DRIVER_MAP>,
 *     driverClass?: value-of<DriverManager::DRIVER_MAP>
 * }
 */
class DatabaseService
{
    /**
     * @param ConnectionParams $params
     */
    public function connect(array $params): void
    {
        // ...
    }
}

$service = new DatabaseService();

$service->connect(['driver' => 'pdo_mysql']); // Valid

$service->connect(['driver' => 'pdo_invalid']);
// Throws TypeError: Argument $params['driver'] must be a key of DriverManager::DRIVER_MAP
```

---

## Precise Call-Site Trace Attribution (Zero Line-Drift)

A common problem with AST code injection is that adding new statements pushes subsequent code down, causing line numbers in stack traces to drift out of sync.

TypePHP solves this with **Zero Line-Drift Formatting**. Injected guard rails are squashed onto single lines and appended directly to existing code blocks. **Line numbers in your source files remain 100% identical before and after transformation.**

When a type contract fails, web exception handlers (**Laravel Ignition, Whoops, Symfony ErrorHandler**) and CLI test runners (**Pest, PHPUnit**) point **directly to the exact line number** where the invalid assignment or return value occurred in your application code:

### Web Framework Trace (Laravel Ignition)
![Laravel Ignition Exception Trace](/screenshots/laravel-error-screen.png)

### Web Framework Trace (Symfony ErrorHandler)
![Symfony Exception Trace](/screenshots/symfony-error-screen.png)

### CLI Test Runner Trace (Pest PHP)
![Pest CLI Exception Trace](/screenshots/pestpest-error-screen.png)
