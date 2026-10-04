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

## Single-Pass Codebase Auditing in Test Suites (Audit Mode)

When onboarding TypePHP on an existing codebase with legacy DocBlocks, running tests in default fail-fast mode (`'on_violation' => 'throw'`) will halt execution on the very first invalid DocBlock in a bootstrap file or service provider. This forces developers into a slow, iterative loop: *Run test $\rightarrow$ Crash $\rightarrow$ Fix 1 error $\rightarrow$ Run test $\rightarrow$ Crash $\rightarrow$ Fix 1 error*.

**Audit Mode solves this problem.** You can run your test suite in Audit Mode without modifying your test code or application logic:

```bash
TYPEPHP_ON_VIOLATION=report TYPEPHP_REPORT_FILE=var/typephp-report.json ./vendor/bin/pest
```

### How Audit Mode Transforms Test Suite Execution

1. **Zero Test Interruptions:** Your entire test suite executes to 100% completion. No test fails due to a `TypeError` exception.
2. **Comprehensive Report Generation:** Every unique type contract violation across all tests is deduplicated in memory and written to `var/typephp-report.json`.
3. **Terminal Review:** Run `vendor/bin/typephp report` to view a clean, color-coded summary table of all violations grouped by file directly in your terminal.
4. **Batch Remediation:** Review the report and address all violations in one pass—either by fixing stale DocBlocks, adding `@typephp-ignore` annotations, or blacklisting legacy paths in `typephp.php`.

::: tip Dedicated Violation Reporting Guide
For complete details on JSON report schemas, violation categories (`kind`), and warning modes (`'warn'`), see the dedicated [Violation Reporting & Auditing](/core-concepts/violation-reporting) guide.
:::

---

## Non-Blocking CI Quality Gates (`fail_on_report => true`)

In automated CI/CD pipelines, you often want test suites to run completely to capture all diagnostic artifacts while still marking the CI build job as **failed (Red ❌)** if type violations exist.

Enable `TYPEPHP_FAIL_ON_REPORT=true` in your CI environment:

```yaml
# In your GitHub Actions CI Workflow:
- name: Run Test Suite in Audit Mode
  run: ./vendor/bin/pest --compact
  env:
    TYPEPHP_ON_VIOLATION: 'report'
    TYPEPHP_REPORT_FILE: 'var/typephp-report.json'
    TYPEPHP_FAIL_ON_REPORT: 'true'

- name: Upload TypePHP Audit Report Artifact
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: typephp-audit-report
    path: var/typephp-report.json
```

### How CI Gatekeeping Works

1. All tests execute to completion without throwing exceptions mid-run.
2. TypePHP records every unique type contract failure in `var/typephp-report.json`.
3. During PHP process shutdown, if violations were recorded, TypePHP prints a summary to `STDERR` and terminates the process with exit code `1`, failing the CI build step while preserving the audit report artifact.

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

## Parallel Multi-Process Testing & Lock-Free Sharding

TypePHP provides full out-of-the-box support for multi-process parallel test runners, including:
* **Pest Parallel**: `./vendor/bin/pest --parallel --processes=4`
* **ParaTest**: `./vendor/bin/paratest -p 4 --runner WrapperRunner`
* **Laravel Parallel Testing**: `php artisan test --parallel`

```
                       [ pest --parallel (Parent Orchestrator) ]
                          • Coordinates worker processes over pipes.
                          • TypePHP stands down in the orchestrator.
                                           │
         ┌───────────────────┬─────────────┴─────┬───────────────────┐
         ▼                   ▼                   ▼                   ▼
   [ Worker #1 ]       [ Worker #2 ]       [ Worker #3 ]       [ Worker #4 ]
  (TEST_TOKEN=1)      (TEST_TOKEN=2)      (TEST_TOKEN=3)      (TEST_TOKEN=4)
        │                   │                   │                   │
  TypePHP Boots       TypePHP Boots       TypePHP Boots       TypePHP Boots
  StreamWrapper ON    StreamWrapper ON    StreamWrapper ON    StreamWrapper ON
        │                   │                   │                   │
  Writes shard_1      Writes shard_2      Writes shard_3      Writes shard_4
        │                   │                   │                   │
        └───────────────────┴─────────┬─────────┴───────────────────┘
                                      ▼
                      [ Lock-Free Worker Shard Directory ]
                        var/.typephp-shards/shard_*.json
                                      │
                                      ▼ (Automatic Map-Reduce Consolidation)
                        [ Consolidated typephp-report.json ]
```

### Multi-Process Parallel Architecture Under the Hood

1. **Lock-Free Parallel Sharding in Audit Mode:** In `'report'` mode, each parallel worker detects its worker ID (`TEST_TOKEN` or `PEST_PARALLEL_WORKER_ID`) and writes to an isolated shard file (`var/.typephp-shards/shard_<token>_<pid>.json`). Workers never fight for file locks (`flock`), ensuring **0ms lock contention**.
2. **Automatic Map-Reduce Consolidation:** Running `vendor/bin/typephp report` or calling `TypePHP::exportReport()` merges all worker shards, deduplicates identical violations across processes, writes the final master `var/typephp-report.json`, and cleans up the temporary shard directory.
3. **High-Performance Shared Disk Cache:**
   * **Concurrent Non-Blocking Reads:** Operating systems handle simultaneous reads to the same cached file natively without race conditions.
   * **Atomic File Writes:** If multiple workers transform the same file at the exact same millisecond, TypePHP writes to unique temporary files (`.tmp_*`) and uses atomic OS renames.

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

---

## Production CI Workflow Examples

---

### 1. Non-Blocking Audit CI Workflow (Pest Parallel + JSON Report Artifact)

This workflow runs your parallel test suite in Audit Mode, uploads the audit report artifact, and fails the build step if violations exist:

```yaml
name: TypePHP Audit CI Suite

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  audit:
    name: Audit Suite (PHP ${{ matrix.php }})
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        php: ['8.3', '8.4']

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

      # Pre-warm shared disk cache for instant execution across parallel workers
      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      # Runs parallel suite in Audit Mode with fail_on_report gatekeeping
      - name: Run Pest Parallel in Audit Mode
        run: ./vendor/bin/pest --parallel --processes=4 --compact
        env:
          TYPEPHP_ON_VIOLATION: 'report'
          TYPEPHP_REPORT_FILE: 'var/typephp-report.json'
          TYPEPHP_FAIL_ON_REPORT: 'true'

      # Uploads consolidated audit report artifact for review
      - name: Upload TypePHP Audit Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: typephp-audit-report-php${{ matrix.php }}
          path: var/typephp-report.json
```

---

### 2. Pest v4+ Native Test Sharding Workflow

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

      - name: Warm Up TypePHP Cache
        run: php vendor/bin/typephp cache:warm

      - name: Run Pest Shard
        run: ./vendor/bin/pest --shard=${{ matrix.shard }}/4 --compact
```