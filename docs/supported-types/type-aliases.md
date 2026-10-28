# Type Aliases

TypePHP supports declaring local type aliases (`@phpstan-type` / `@psalm-type`) and importing type aliases from other classes (`@phpstan-import-type` / `@psalm-import-type`). This allows you to centralize and reuse complex array shapes, unions, and generic structures across your application.

> **Tooling Compatibility:** Both PHPStan syntax (`@phpstan-type`, `@phpstan-import-type`) and Psalm syntax (`@psalm-type`, `@psalm-import-type`) are parsed identically and enforced at runtime.

---

## How Type Aliases Work

When you declare or import a type alias:
1. **AST Pre-Substitution:** During reflection and file analysis, `DocblockExtractor` and `DocblockParser` resolve the alias into its underlying concrete TypeNode.
2. **$O(1)$ Static Caching:** The resolved contract is memoized in static memory. Subsequent function calls execute at native speed with zero alias re-parsing overhead.
3. **Recursive Resolution:** Type aliases can reference other aliases, compose shapes, and form multi-class import chains.

---

## Class-Scope Isolation (Strict Non-Global Rule)

In strict accordance with the PHPStan and Psalm type system specifications, **type aliases are strictly class-scoped**:

* An alias declared on `ClassA` is **only visible inside `ClassA`**.
* Type aliases **do NOT leak into the global namespace** or into other classes in the same file.
* If a standalone function or another class attempts to reference `UserShape` without importing it, TypePHP will not recognize it as an alias. Instead, TypePHP treats `UserShape` as a nominal class name (looking for an actual `class UserShape {}`), causing validation to fail.

To consume an alias outside its declaring class, consumer classes **must explicitly import it** via `@phpstan-import-type`:

<TypePHPSnippet title="Class-Scope Isolation & Non-Global Behavior" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Demo;

/**
 * 1. UserShape is declared strictly inside the scope of AccountManager!
 *
 * @phpstan-type UserShape array{id: positive-int, name: non-empty-string}
 */
class AccountManager
{
    /**
     * @param UserShape $user
     */
    public function register(array $user): void
    {
        echo "✓ Registered within declaring class: {$user['name']} (#{$user['id']})\n";
    }
}

/**
 * 2. Another class that forgets to import UserShape:
 */
class ExternalService
{
    /**
     * Inactive alias! UserShape was not imported via @phpstan-import-type.
     * TypePHP treats 'UserShape' as a class name (App\Demo\UserShape), NOT the alias!
     *
     * @param UserShape $user
     */
    public function process(array $user): void
    {
        echo "Processing...\n";
    }
}

$manager = new AccountManager();
$external = new ExternalService();

// 1. Inside declaring class: UserShape is active and enforced!
$manager->register(['id' => 10, 'name' => 'Alice']);

echo "\n";

// 2. Outside declaring class without import:
// Passing an array fails because TypePHP looks for an instance of class UserShape!
try {
    $external->process(['id' => 10, 'name' => 'Alice']);
} catch (\TypeError $e) {
    echo "✗ Un-imported alias failure:\n   " . $e->getMessage() . "\n";
    echo "  (TypePHP expected an instance of Global UserShape Class because the alias was not imported)\n";
}
```

</TypePHPSnippet>

---

## Local Type Aliases (`@phpstan-type` / `@psalm-type`)

Declare a local type alias above a class or interface definition using `@phpstan-type` or `@psalm-type`. Once declared, you can reference the alias in any parameter, return, property, or `@var` docblock within that class:

<TypePHPSnippet title="Local Type Aliases (@phpstan-type & @psalm-type)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Local Type Aliases:
 *
 * @phpstan-type UserShape array{id: positive-int, username: non-empty-string, role: 'admin'|'editor'|'viewer'}
 * @psalm-type UserStatus 'active'|'pending'|'archived'
 */
class UserService
{
    /**
     * @param UserShape $user
     * @param UserStatus $status
     */
    public function updateUser(array $user, string $status): void
    {
        echo "✓ Updated user #{$user['id']} ({$user['username']}) with status '{$status}'\n";
    }
}

$service = new UserService();

// 1. Happy Path: Valid payload matching UserShape and UserStatus
$service->updateUser(
    ['id' => 10, 'username' => 'Alice', 'role' => 'admin'],
    'active'
);

echo "\n";

// 2. Shape Failure: Negative integer violates positive-int inside UserShape
try {
    $service->updateUser(
        ['id' => -5, 'username' => 'Alice', 'role' => 'admin'],
        'active'
    );
} catch (\TypeError $e) {
    echo "✗ UserShape contract violation:\n   " . $e->getMessage() . "\n\n";
}

// 3. Status Failure: 'suspended' violates literal union in UserStatus
try {
    $service->updateUser(
        ['id' => 10, 'username' => 'Alice', 'role' => 'admin'],
        'suspended'
    );
} catch (\TypeError $e) {
    echo "✗ UserStatus contract violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Imported Type Aliases (`@phpstan-import-type` / `@psalm-import-type`)

To share type aliases across multiple classes, declare your schemas in a central definition class (e.g. `GlobalTypes` or a domain model) and import them into other classes using `@phpstan-import-type` or `@psalm-import-type`:

<TypePHPSnippet title="Imported Type Aliases (@phpstan-import-type)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Types;

/**
 * Central schema registry
 *
 * @phpstan-type SharedUserShape array{id: positive-int, email: non-empty-string}
 * @psalm-type SharedRole 'admin'|'user'
 */
class GlobalTypes {}

namespace App\Api;

use App\Types\GlobalTypes;

/**
 * Import shared schemas from GlobalTypes
 *
 * @phpstan-import-type SharedUserShape from GlobalTypes
 * @psalm-import-type SharedRole from GlobalTypes
 */
class UserApi
{
    /**
     * @param SharedUserShape $user
     * @param SharedRole $role
     */
    public function saveUser(array $user, string $role): void
    {
        echo "✓ Saved {$role} user #{$user['id']}: {$user['email']}\n";
    }
}

$api = new UserApi();

// 1. Happy Path: Matches both imported schemas
$api->saveUser(['id' => 42, 'email' => 'alice@example.com'], 'admin');

echo "\n";

// 2. Failure: Empty string violates non-empty-string in SharedUserShape
try {
    $api->saveUser(['id' => 42, 'email' => ''], 'admin');
} catch (\TypeError $e) {
    echo "✗ Imported SharedUserShape violation:\n   " . $e->getMessage() . "\n\n";
}

// 3. Failure: 'manager' is not allowed in SharedRole union
try {
    $api->saveUser(['id' => 42, 'email' => 'alice@example.com'], 'manager');
} catch (\TypeError $e) {
    echo "✗ Imported SharedRole violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Importing with Local Renaming (`as`)

Use the `as` keyword to rename an imported type alias locally. This is useful for avoiding naming collisions or adopting a naming convention that fits the consumer class:

<TypePHPSnippet title="Importing with Renaming (as)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Definitions;

/**
 * @phpstan-type ConfigShape array{apiKey: non-empty-string, timeout: int<1, 60>}
 */
class ServiceDefinitions {}

namespace App\Services;

use App\Definitions\ServiceDefinitions;

/**
 * Renaming imported ConfigShape to LocalConfig to fit class terminology
 *
 * @phpstan-import-type ConfigShape from ServiceDefinitions as LocalConfig
 */
class PaymentGateway
{
    /**
     * @param LocalConfig $config
     */
    public function initialize(array $config): void
    {
        echo "✓ Initialized gateway with timeout: {$config['timeout']}s\n";
    }
}

$gateway = new PaymentGateway();

// 1. Happy Path
$gateway->initialize(['apiKey' => 'sec_live_987654', 'timeout' => 30]);

echo "\n";

// 2. Failure: Timeout 120 exceeds int<1, 60> bound in LocalConfig
try {
    $gateway->initialize(['apiKey' => 'sec_live_987654', 'timeout' => 120]);
} catch (\TypeError $e) {
    echo "✗ Renamed alias (LocalConfig) violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Naming Collisions (When `as` is Omitted)

If a class defines a local `@phpstan-type Status` AND imports a type alias with the exact same name (`@phpstan-import-type Status from RemoteService`) **without using the `as` keyword**:

1. **Resolution Priority (Local Overwrites / Blocks Import):** Local `@phpstan-type` definitions are registered first. Any unaliased import sharing the same name is **silently skipped and discarded**.
2. **The Danger:** If you intended to consume the remote definition, your methods will continue enforcing the local definition instead, causing valid remote values to be rejected with a `TypeError`.
3. **The Solution:** Always rename imported aliases using the `as` keyword (e.g. `as RemoteStatus`) whenever names collide.

<TypePHPSnippet title="Naming Collisions: Local Definition Takes Priority" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Remote;

/**
 * Remote service defines Status as 'open'|'closed'
 *
 * @phpstan-type Status 'open'|'closed'
 */
class RemoteService {}

namespace App\Local;

use App\Remote\RemoteService;

/**
 * LocalOrderService defines local Status as 'active'|'pending',
 * AND imports Status from RemoteService without the 'as' keyword!
 *
 * @phpstan-type Status 'active'|'pending'
 * @phpstan-import-type Status from RemoteService
 */
class LocalOrderService
{
    /**
     * Because 'as' was omitted, the LOCAL definition ('active'|'pending')
     * takes precedence and BLOCKS the imported definition!
     *
     * @param Status $status
     */
    public function updateStatus(string $status): void
    {
        echo "✓ Accepted status: '{$status}'\n";
    }
}

$service = new LocalOrderService();

// 1. The local definition ('active'|'pending') is what remains active:
$service->updateStatus('active');

echo "\n";

// 2. Passing 'open' (from the unaliased import) FAILS because the local definition won:
try {
    echo "Attempting to pass remote status 'open'...\n";
    $service->updateStatus('open');
} catch (\TypeError $e) {
    echo "✗ Collision: Local definition took precedence over unaliased import:\n   " . $e->getMessage() . "\n";
    echo "  (Fix: Use '@phpstan-import-type Status from RemoteService as RemoteStatus' to import safely!)\n";
}
```

</TypePHPSnippet>

---

## Chained Type Alias Imports (Multi-Level Resolution)

TypePHP recursively resolves multi-level type alias import chains down to the root definition across any number of classes:

* **Level 1 (`CoreTypes`):** Defines `@phpstan-type Identifiable array{id: positive-int}`.
* **Level 2 (`MidService`):** Imports `@phpstan-import-type Identifiable from CoreTypes`.
* **Level 3 (`ClientService`):** Imports `@phpstan-import-type Identifiable from MidService as ClientEntity`.

When `ClientService` validates `$payload` against `ClientEntity`, TypePHP automatically traverses the 3-class import chain back to `CoreTypes` in static RAM and enforces `array{id: positive-int}`:

<TypePHPSnippet title="Chained Multi-Level Alias Imports" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Core;

/**
 * Level 1: Root definition
 *
 * @phpstan-type Identifiable array{id: positive-int}
 */
class CoreTypes {}

namespace App\Domain;

use App\Core\CoreTypes;

/**
 * Level 2: Intermediary class importing from CoreTypes
 *
 * @phpstan-import-type Identifiable from CoreTypes
 */
class MidService {}

namespace App\Client;

use App\Domain\MidService;

/**
 * Level 3: Consumer importing from MidService and renaming
 *
 * @phpstan-import-type Identifiable from MidService as ClientEntity
 */
class ClientService
{
    /**
     * @param ClientEntity $entity
     */
    public function process(array $entity): void
    {
        echo "✓ Successfully processed entity #{$entity['id']}\n";
    }
}

$client = new ClientService();

// 1. Happy Path: Resolves 3 levels down to array{id: positive-int}
$client->process(['id' => 100]);

echo "\n";

// 2. Failure: Negative integer violates root definition in CoreTypes
try {
    $client->process(['id' => -5]);
} catch (\TypeError $e) {
    echo "✗ Chained import resolution failure:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## Composing Type Aliases with Shapes & Intersections

You can compose multiple imported or local type aliases using intersections (`&`) to construct unified domain schemas:

<TypePHPSnippet title="Composing Type Aliases via Intersections" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\Models;

/**
 * @phpstan-type HasId       array{id: positive-int}
 * @phpstan-type HasAudit    array{created_at: non-empty-string}
 * @phpstan-type HasTags     array{tags: list<non-empty-string>}
 * @phpstan-type FullArticle HasId & HasAudit & HasTags
 */
class ArticleRepository
{
    /**
     * @param FullArticle $article
     */
    public function save(array $article): void
    {
        echo "✓ Saved Article #{$article['id']} with " . count($article['tags']) . " tag(s)\n";
    }
}

$repo = new ArticleRepository();

// 1. Valid: Satisfies all 3 composed type aliases
$repo->save([
    'id' => 101,
    'created_at' => '2026-10-27',
    'tags' => ['php', 'typephp', 'runtime'],
]);

echo "\n";

// 2. Failure: Missing 'tags' from HasTags alias
try {
    $repo->save([
        'id' => 101,
        'created_at' => '2026-10-27',
    ]);
} catch (\TypeError $e) {
    echo "✗ Missing key from composed alias:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>
```