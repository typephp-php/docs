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
  Cache: ..._w1       Cache: ..._w2       Cache: ..._w3       Cache: ..._w4
```

### Multi-Process Architecture Under the Hood

1. **Orchestrator Non-Interference**: The parent test runner process coordinates child worker processes over OS communication pipes (`proc_open`, STDIN/STDOUT) without stream wrapper interception.
2. **Automatic Worker Bootstrapping**: Each child worker process inherits an environment variable (`TEST_TOKEN=1`, `TEST_TOKEN=2`, etc.) and automatically boots TypePHP inside its own isolated process space.
3. **Worker Cache Directory Isolation**: When disk caching is enabled, each worker writes to its own isolated cache folder (e.g. `/tmp/typephp-cache-..._w1`, `_w2`), completely eliminating multi-process lock contention and race conditions.

---

## Parallel Performance Strategies: In-Memory vs. Disk Cache

When configuring TypePHP for parallel test suites in `typephp.php`, you have two performance strategies:

### Strategy A: In-Memory Mode (Recommended for Parallel Test Suites)

Set `'cache' => false` in `typephp.php`:

```php
// typephp.php
return [
    /*
    | Runs AST transformations purely in RAM (php://memory) per worker.
    | Completely eliminates disk I/O and multi-process file collisions.
    */
    'cache' => false,
    
    'include' => [
        'src/**',
        'tests/**',
    ],
    'exclude' => [
        'vendor/**',
    ],
];
```

*Every worker process transforms files in its own isolated memory space (`php://memory`), providing maximum speed with zero disk I/O and zero file contention.*

### Strategy B: Disk Caching with Worker Isolation

If you prefer disk caching (`'cache' => true`):
* Each worker process will automatically write to its own isolated worker cache folder on disk (`/tmp/typephp-cache-..._w1`, `_w2`, etc.).
* Running `php vendor/bin/typephp cache:clear` automatically discovers and deletes all worker directories (`_w1`, `_w2`, etc.) along with the primary cache.

> **Note on `cache:warm`:** The CLI command `php vendor/bin/typephp cache:warm` executes in a single parent CLI process and pre-warms the base cache directory. When running parallel multi-worker suites, using Strategy A (`'cache' => false`) is recommended for the fastest execution.

---

## GitHub Actions CI Workflow Examples

Below are production-ready GitHub Actions workflow configurations tailored for different test runners and concurrency setups.

---

### 1. Pest PHP: Parallel Multi-Process Workflow

This workflow executes tests across 4 parallel processes per matrix runner using the in-memory strategy (`'cache' => false`):

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

      # Executes tests across 4 parallel workers with zero IPC interference
      - name: Run Pest in Parallel
        run: ./vendor/bin/pest --parallel --processes=4 --compact
```

---

### 2. Pest PHP: Sequential Workflow with Code Coverage

This workflow runs tests sequentially, pre-warms the disk cache before test execution, and generates a Codecov coverage report on PHP 8.4:

```yaml
name: Pest Sequential Tests

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
          coverage: ${{ matrix.os == 'ubuntu-latest' && matrix.php == '8.4' && 'pcov' || 'none' }}

      - name: Install Dependencies
        uses: ramsey/composer-install@v3

      # Pre-warm disk cache for instant O(1) file execution
      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      # Run with coverage on Ubuntu PHP 8.4
      - name: Run Pest with Coverage
        run: ./vendor/bin/pest --coverage-clover=clover.xml --compact
        if: matrix.os == 'ubuntu-latest' && matrix.php == '8.4'

      # Run without coverage on other matrix runners
      - name: Run Pest
        run: ./vendor/bin/pest --compact
        if: "! (matrix.os == 'ubuntu-latest' && matrix.php == '8.4')"

      - name: Upload Coverage to Codecov
        uses: codecov/codecov-action@v5
        if: matrix.os == 'ubuntu-latest' && matrix.php == '8.4'
        with:
          token: ${{ secrets.CODECOV_TOKEN }}
          files: clover.xml
          fail_ci_if_error: false
```

---

### 3. PHPUnit: ParaTest Multi-Process Parallel Workflow

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

      # Execute ParaTest with 4 parallel worker processes
      - name: Execute ParaTest
        run: ./vendor/bin/paratest -p 4 --runner WrapperRunner
```

---

### 4. PHPUnit: Standard Sequential Workflow

This workflow executes standard single-process PHPUnit with pre-warmed disk caching:

```yaml
name: PHPUnit Sequential Suite

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

      # Run standard sequential PHPUnit
      - name: Run PHPUnit
        run: ./vendor/bin/phpunit --display-deprecations --display-errors --display-warnings
```
