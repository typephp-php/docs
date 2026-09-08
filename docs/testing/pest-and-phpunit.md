# Testing with Pest & PHPUnit

TypePHP is designed to integrate transparently into modern testing workflows. Because it boots automatically whenever Composer's `vendor/autoload.php` is loaded, it requires zero custom test runners, base classes, or boilerplate configuration.

---

## Why Enforce Types During Testing?

While static analysis tools (such as PHPStan and Psalm) verify code structure at compile time, unit and integration tests execute against live dynamic data:
* Verifying that mock objects, database records, and API responses satisfy declared contracts.
* Ensuring that generic collections (`Collection<User>`) do not suffer from type drift or silent data pollution.
* Catching parameter contract violations before code reaches production.

---

## Standard Test Execution

Execute your test suite using your standard commands:

```bash
# Pest PHP
./vendor/bin/pest

# PHPUnit
./vendor/bin/phpunit
```

TypePHP automatically weaves type guards into included application files and validates parameters, returns, and properties on every test execution.

---

## Testing Type Contracts in Pest

Use Pest's `toThrow()` assertion to verify that invalid data correctly triggers a `TypePHP\Exception\TypeError`:

```php
<?php

use App\Services\UserService;
use TypePHP\Exception\TypeError;

test('accepts valid user payload', function () {
    $service = new UserService();
    $result = $service->format(42, 'Alice');

    expect($result)->toBe(['id' => 42, 'name' => 'Alice']);
});

test('catches invalid integer parameter at runtime', function () {
    $service = new UserService();

    expect(fn () => $service->format(-1, 'Alice'))
        ->toThrow(TypeError::class, 'positive-int');
});

test('enforces reified generic type safety on collections', function () {
    /** @var \App\Collections\Collection<\App\Models\User> $users */
    $users = new \App\Collections\Collection();

    $users->add(new \App\Models\User('Alice'));
    expect($users->count())->toBe(1);

    expect(fn () => $users->add(new \App\Models\Product('SKU-100')))
        ->toThrow(TypeError::class, 'must be of type App\Models\User');
});
```

---

## Testing Type Contracts in PHPUnit

In standard PHPUnit test cases, use `$this->expectException()`:

```php
<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use App\Services\UserService;
use TypePHP\Exception\TypeError;

class UserServiceTest extends TestCase
{
    public function testValidUserFormatting(): void
    {
        $service = new UserService();
        $result = $service->format(10, 'Bob');

        $this->assertSame(10, $result['id']);
        $this->assertSame('Bob', $result['name']);
    }

    public function testInvalidUserParameterThrowsTypeError(): void
    {
        $service = new UserService();

        $this->expectException(TypeError::class);
        $service->format(-5, 'Bob');
    }
}
```

---

## Scaling Large Applications & Deep Inheritance Suites

### Understanding TypePHP's Overhead in Massive Codebases

TypePHP performs AST transformations, traverses class/interface/trait hierarchies for LSP contract inheritance, and maintains runtime reified generic state in `\WeakMap`. 

In large monolithic applications with **deep nested inheritance chains (4+ levels of parent classes, traits, and interfaces)** or **thousands of tests**, running TypePHP on every single file across the entire repository simultaneously can increase test suite execution time.

To maintain ultra-fast feedback loops in local development and CI/CD pipelines, use the following scaling strategies:

---

### Strategy 1: Targeted Domain & Directory Inclusion

Rather than type-checking your entire codebase indiscriminately, configure `typephp.php` to target specific core domains, high-risk modules, or active development folders:

```php
// typephp.php
return [
    /*
    | Strategically target mission-critical domains (e.g. Billing, Auth, Core API)
    | while excluding low-risk legacy monolith directories.
    */
    'include' => [
        'app/Domains/Billing/**',
        'app/Domains/Authentication/**',
        'app/Services/Payment/**',
        'tests/Feature/Billing/**',
    ],
    'exclude' => [
        'vendor/**',
        'storage/**',
        'app/Legacy/**', // Skip legacy monolith sections
    ],
];
```

---

### Strategy 2: Native Pest Test Sharding (`--shard=x/N`, Pest v4+)

If you are using **Pest v4 or higher (v4.0+, v5+)**, Pest includes **native out-of-the-box Test Sharding**. This allows you to split your test suite automatically across multiple CI runner machines without having to manually partition directories:

```bash
# Execute Shard 1 of 4 across your CI matrix
./vendor/bin/pest --shard=1/4 --compact

# Execute Shard 2 of 4
./vendor/bin/pest --shard=2/4 --compact
```

*Pest automatically divides all test files evenly across the runner matrix. Each machine executes only $1/N^{\text{th}}$ of the total tests, slashing CI runtimes while maintaining 100% TypePHP runtime contract enforcement.*

> **Pest v4.6+ Time-Balanced Sharding:** In Pest v4.6.0+ and Pest 5, you can run `pest --update-shards` to record execution timings (`tests/.pest/shards.json`). Pest will then balance shards by actual test duration rather than simple file counts, ensuring all CI matrix runners finish at roughly the same second.

---

### Strategy 3: Domain Partitioning in CI (Pest v2, v3, & PHPUnit)

If you are using **Pest v2/v3** or standard **PHPUnit** (where native `--shard` is not built into core), split your test runs by domain or directory across separate parallel matrix jobs in your CI pipeline:

```
                                [ GitHub Actions CI Matrix ]
                                             │
         ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
         ▼                   ▼                               ▼                   ▼
   [ Job: Auth ]      [ Job: Billing ]               [ Job: Orders ]      [ Job: Unit Tests ]
  tests/Feature/Auth  tests/Feature/Billing          tests/Feature/Orders  tests/Unit
```

---

## Parallel Multi-Process Testing

TypePHP provides full out-of-the-box support for multi-process parallel test runners, including:
* **Pest Parallel**: `./vendor/bin/pest --parallel --processes=4`
* **ParaTest**: `./vendor/bin/paratest -p 4 --runner WrapperRunner`
* **Laravel Parallel Testing**: `php artisan test --parallel`

```
                       [ pest --parallel (Parent Orchestrator) ]
                          • Does not execute test cases directly.
                          • TypePHP stands down in the orchestrator.
                          • Zero IPC stream pipe interference.
                                           │
         ┌───────────────────┬─────────────┴─────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
   [ Worker #1 ]       [ Worker #2 ]       [ Worker #3 ]       [ Worker #4 ]
  (TEST_TOKEN=1)      (TEST_TOKEN=2)      (TEST_TOKEN=3)      (TEST_TOKEN=4)
        │                   │                   │                   │
  TypePHP Boots       TypePHP Boots       TypePHP Boots       TypePHP Boots
  StreamWrapper ON    StreamWrapper ON    StreamWrapper ON    StreamWrapper ON
        │                   │                   │                   │
        └───────────────────┴─────────┬─────────┴───────────────────┘
                                      ▼
                   [ Unified Shared Cache Directory ]
                     • Non-blocking concurrent reads
                     • Atomic writes (temp file + rename)
                     • Deterministic AST bytecode reuse
```

### Multi-Process Architecture Under the Hood

1. **Orchestrator Non-Interference**: The parent test runner process coordinates child worker processes over OS communication pipes (`proc_open`, STDIN/STDOUT) without stream wrapper interception.
2. **Automatic Worker Bootstrapping**: Each child worker process inherits an environment variable (`TEST_TOKEN=1`, `TEST_TOKEN=2`, etc.) and automatically boots TypePHP inside its own isolated process space.
3. **High-Performance Shared Cache Architecture**:
   * **Concurrent Non-Blocking Reads**: Operating systems handle simultaneous reads to the same cached file natively without race conditions. All workers share the same warmed cache files simultaneously.
   * **Atomic File Writes**: If multiple workers transform the same file at the exact same millisecond, TypePHP writes to unique temporary files (`.tmp_*`) and uses atomic OS renames.
   * **Deterministic Idempotency**: Because AST transformations are completely deterministic and class/function structures do not mutate at runtime, all workers produce 100% identical cached bytecode.

---

## Parallel Performance Strategies: In-Memory vs. Disk Cache

When configuring TypePHP for test suites in `typephp.php`, choose the optimal caching strategy:

### Strategy A: Pre-Warmed Shared Disk Cache (Fastest for CI & Local Parallel Runs)

Keep `'cache' => true` and run `cache:warm` before executing tests:

```bash
# 1. Pre-warm the shared cache once in a single CLI process
php vendor/bin/typephp cache:warm

# 2. Parallel workers immediately read from the shared cache with O(1) speed
./vendor/bin/pest --parallel --processes=4
```

*All parallel workers read from the exact same pre-warmed cache files with zero compilation overhead during test execution.*

### Strategy B: Pure In-Memory Mode (`php://memory`)

Set `'cache' => false` in `typephp.php`:

```php
// typephp.php
return [
    /*
    | Runs AST transformations purely in RAM (php://memory) per worker.
    | Completely eliminates disk writes.
    */
    'cache' => false,
];
```

*Every worker process transforms files in its own isolated memory space (`php://memory`), providing zero disk I/O.*

---

## Production CI Workflow Examples

---

### 1. Pest v4+ Native Test Sharding Workflow (Recommended for Large Suites)

This workflow uses **Pest v4+ native sharding** with a pre-warmed shared cache across 4 parallel CI machines:

```yaml
name: Pest v4+ Test Sharding Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-shards:
    name: Shard ${{ matrix.shard }} of 4 (PHP ${{ matrix.php }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['8.3', '8.4']
        shard: [1, 2, 3, 4]

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: dom, mbstring, zip, libxml, json, tokenizer, fileinfo
          coverage: none

      - name: Install Dependencies
        uses: ramsey/composer-install@v3

      # Pre-warm the shared cache once on the runner machine
      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      # Executes exact shard fraction reading from the pre-warmed shared cache
      - name: Run Pest Shard
        run: ./vendor/bin/pest --shard=${{ matrix.shard }}/4 --compact
```

---

### 2. Domain-Partitioned CI Matrix Workflow (Pest v2, v3, & PHPUnit)

This workflow manually partitions your suite across separate domain directories:

```yaml
name: Domain-Partitioned Test Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-domains:
    name: Test Domain (${{ matrix.domain }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['8.3', '8.4']
        domain:
          - 'tests/Unit'
          - 'tests/Feature/Auth'
          - 'tests/Feature/Billing'
          - 'tests/Feature/Orders'

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: dom, mbstring, zip, libxml, json, tokenizer, fileinfo
          coverage: none

      - name: Install Dependencies
        uses: ramsey/composer-install@v3

      # Executes tests strictly for the specific domain folder
      - name: Run Domain Tests
        run: ./vendor/bin/pest ${{ matrix.domain }} --parallel --processes=4 --compact
```

---

### 3. Pest PHP: Standard Parallel Multi-Process Workflow

This workflow executes tests across 4 parallel processes on a single runner using the pre-warmed shared cache:

```yaml
name: Pest Parallel Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: PHP ${{ matrix.php }} on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        php: ['8.2', '8.3', '8.4', '8.5']

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: dom, mbstring, zip, libxml, json, tokenizer, fileinfo
          coverage: none

      - name: Install Dependencies
        uses: ramsey/composer-install@v3

      # Pre-warm shared disk cache for instant O(1) execution across all 4 workers
      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      # Executes tests across 4 parallel workers sharing the same cache
      - name: Run Pest in Parallel
        run: ./vendor/bin/pest --parallel --processes=4 --compact
```

---

### 4. PHPUnit: ParaTest Multi-Process Parallel Workflow

This workflow uses `brianium/paratest` with `WrapperRunner` across 4 worker processes:

```yaml
name: ParaTest Parallel Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: PHP ${{ matrix.php }} on ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        php: ['8.2', '8.3', '8.4', '8.5']

    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
          extensions: dom, mbstring, zip, libxml, json, tokenizer, fileinfo
          coverage: none

      - name: Install Dependencies
        uses: ramsey/composer-install@v3

      # Pre-warm disk cache for instant O(1) file execution
      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      # Execute ParaTest with 4 parallel worker processes
      - name: Execute ParaTest
        run: ./vendor/bin/paratest -p 4 --runner WrapperRunner
```