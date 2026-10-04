# Violation Reporting & Auditing

TypePHP provides three violation handling strategies (`throw`, `report`, and `warn`) allowing you to choose how contract failures are handled at runtime. 

In addition to acting as a strict fail-fast gatekeeper, TypePHP can run as a **non-fatal codebase auditor**, collecting all type discrepancies across an entire test suite or staging application into a single structured JSON report without halting execution.

---

## Overview of Violation Strategies

You can configure the active handling strategy via `'on_violation'` in `typephp.php` or through environment variables:

| Strategy | Behavior | Best Used For |
| :--- | :--- | :--- |
| **`'throw'`** *(Default)* | Throws `TypePHP\Exception\TypeError` on the first violation. | Production gatekeeping, local feature development, and strict test suites. |
| **`'report'`** | Suppresses exceptions; records all unique violations into memory and exports a structured JSON report to `report_file` at shutdown. | 1-pass codebase audits, legacy migration, and non-blocking CI build gates. |
| **`'warn'`** | Suppresses exceptions; emits a native PHP `E_USER_WARNING` once per unique violation and continues execution normally. | Live staging logs, local dev server logs, and APM monitoring (Sentry / Bugsnag). |

---

## Strategy 1: Strict Fail-Fast (`'on_violation' => 'throw'`, Default)

By default, TypePHP operates as a strict runtime gatekeeper. The moment an invalid argument, return value, or property assignment occurs, TypePHP halts execution immediately by throwing `TypePHP\Exception\TypeError`:

```php
// typephp.php
return [
    'on_violation' => 'throw',
];
```

```php
/**
 * @param positive-int $id
 */
function findUser(int $id): array { ... }

findUser(-5);
// Halts execution immediately!
// Throws: TypeError: findUser(): Argument $id must be of type positive-int, negative int (-5) given
```

---

## Strategy 2: Single-Pass Audit & Report Mode (`'on_violation' => 'report'`)

When adopting TypePHP on an existing codebase with legacy DocBlocks, running in fail-fast mode can halt execution on the very first invalid DocBlock in a bootstrap file or service provider, forcing developers to fix errors one by one in an iterative trial-and-error loop.

**Audit Mode solves this problem.** When `'on_violation' => 'report'` is active:
1. **Zero Execution Crashes:** Contract failures do not throw exceptions. Execution continues naturally using the original runtime values.
2. **$O(1)$ In-Memory Deduplication:** Repeated violations inside loops (e.g. iterating 50,000 array items) are deduplicated in RAM so memory never explodes.
3. **Shutdown JSON Export:** At script completion, TypePHP exports all collected violations into a structured JSON report file.

```php
// typephp.php
return [
    'on_violation' => 'report',
    'report_file'  => __DIR__ . '/var/typephp-report.json',
];
```

```php
/**
 * @param positive-int $id
 * @param non-empty-string $name
 */
function registerUser(int $id, string $name): void { ... }

// Executes to completion without crashing!
registerUser(-10, ''); 
registerUser(-20, 'Alice');

// At shutdown, TypePHP generates var/typephp-report.json containing both violations!
```

---

## CI/CD Non-Blocking Gatekeeping (`fail_on_report => true`)

When running automated test suites in CI/CD pipelines, you often want:
1. The test suite to **run 100% to completion** so you receive a full test report.
2. The CI pipeline job to **fail (Red ❌)** if type violations were detected.

Enable `'fail_on_report' => true` to achieve this:

```php
// typephp.php
return [
    'on_violation'   => 'report',
    'report_file'    => __DIR__ . '/var/typephp-report.json',
    'fail_on_report' => true, // Exits with status 1 at shutdown if violations exist
];
```

### How CI Gatekeeping Works Under the Hood

1. Your entire Pest / PHPUnit test suite executes to completion without throwing exceptions mid-run.
2. All contract violations are saved to `var/typephp-report.json`.
3. During PHP's process shutdown handler, TypePHP detects that violations were recorded, prints a summary message to `STDERR`, and invokes `exit(1)`:

```text
[TypePHP] 4 contract violation(s) recorded in report. Exiting with status 1.
```

Your CI pipeline receives a non-zero exit code (`1`), blocking the pull request while making the complete `var/typephp-report.json` available as a downloadable CI build artifact.

---

## Strategy 3: Real-Time Warnings (`'on_violation' => 'warn'`)

In live staging environments, local dev servers (Laravel Herd, Docker, PHP-FPM), or monitoring pipelines, `'on_violation' => 'warn'` emits a native PHP `E_USER_WARNING` directly to your error stream while allowing the web request or CLI command to finish normally:

```php
// typephp.php
return [
    'on_violation' => 'warn',
];
```

### Log Spam Prevention ($O(1)$ Warning Deduplication)

To prevent log files from bloating when a violation occurs inside a high-volume loop, TypePHP **deduplicates warnings in static memory**. 

The first time a specific violation occurs at a call site, TypePHP emits `E_USER_WARNING`. Subsequent occurrences of the exact same violation in the same process are handled silently in $O(1)$ constant time.

```text
PHP Warning:  [TypePHP Violation] UserService::findUser(): Argument $id must be of type positive-int, negative int (-5) given in /app/src/Services/UserService.php on line 42
```

---

## JSON Report Document Schema

When `'report_file'` is generated, TypePHP outputs a versioned, machine-readable JSON schema designed for both human review and automated tooling:

```json
{
  "version": "1.0",
  "generated_at": "2026-10-03T16:24:00+00:00",
  "summary": {
    "total_violations": 4,
    "files_affected": 3
  },
  "violations": [
    {
      "file": "src/Services/PaymentService.php",
      "line": 42,
      "function": "App\\Services\\PaymentService::charge",
      "kind": "parameter",
      "target": "$amount",
      "expected": "positive-int",
      "given": "negative int (-50)",
      "message": "App\\Services\\PaymentService::charge(): Argument $amount must be of type positive-int, negative int (-50) given"
    },
    {
      "file": "src/Models/User.php",
      "line": 88,
      "function": "App\\Models\\User::assignableRoles",
      "kind": "return",
      "target": "return",
      "expected": "list<int>",
      "given": "App\\Enums\\Role returned",
      "message": "App\\Models\\User::assignableRoles(): Return value[0] must be of type int, App\\Enums\\Role returned"
    },
    {
      "file": "src/Command/GetEntities.php",
      "line": 133,
      "function": "App\\Command\\GetEntities::$default",
      "kind": "property",
      "target": "$default",
      "expected": "array<string, mixed>",
      "given": "bool (false)",
      "message": "Property App\\Command\\GetEntities::$default must be of type array<string, mixed>, bool (false) given"
    },
    {
      "file": "src/Utils/Parser.php",
      "line": 56,
      "function": "App\\Utils\\Parser::parseConfig",
      "kind": "variable",
      "target": "$config",
      "expected": "array{debug: bool, retries: positive-int}",
      "given": "associative array (key 'retries')",
      "message": "Variable $config['retries'] must be of type positive-int, zero int (0) given"
    }
  ]
}
```

### Violation Taxonomy (`kind`)

| `kind` Value | Description |
| :--- | :--- |
| **`'parameter'`** | Function or method parameter contract (`@param`). |
| **`'return'`** | Function or method return contract (`@return`). |
| **`'property'`** | Instance/static property assignment or PHP 8.4 property hook (`@var`, `@property`). |
| **`'variable'`** | Local inline variable assignment (`@var` on `$x = ...`). |
| **`'param-out'`** | By-reference parameter post-condition mutation (`@param-out`). |
| **`'self-out'`** | Generic typestate transition on `$this` (`@self-out` / `@this-out`). |
| **`'callback'`** | Argument or return violation inside a wrapped callable/closure. |
| **`'yield'`** | Generator or iterator yielded key/value violation. |
| **`'send'`** | Generator input violation (`$gen->send()`). |

---

## Parallel Test Runner Sharding (Pest Parallel & ParaTest)

When executing tests across multiple parallel worker processes (`pest --parallel` or `paratest -p 4`):

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ Worker 1 (PID)  │       │ Worker 2 (PID)  │       │ Worker N (PID)  │
│  In-Memory RAM  │       │  In-Memory RAM  │       │  In-Memory RAM  │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │ (At Shutdown)           │ (At Shutdown)           │ (At Shutdown)
         ▼                         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│ shard_w1.json   │       │ shard_w2.json   │       │ shard_wN.json   │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         └────────────────┬────────┴─────────────────────────┘
                          │ (Lock-Free Auto-Consolidation)
                          ▼
            ┌───────────────────────────┐
            │ var/typephp-report.json   │
            │  (Consolidated & Deduped) │
            └───────────────────────────┘
```

1. **Lock-Free Worker Writing:** Each worker process detects its worker ID (`TEST_TOKEN` or `PEST_PARALLEL_WORKER_ID`) and writes to a process-isolated shard file in `var/.typephp-shards/shard_<worker>_<pid>.json`. No file locking (`flock`) or process contention occurs.
2. **Automatic Map-Reduce Consolidation:** When `vendor/bin/typephp report` or `TypePHP::exportReport()` executes, TypePHP merges all worker shards, deduplicates identical violations, writes the master `typephp-report.json`, and cleans up the shard directory.

---

## Terminal CLI Commands

TypePHP provides native CLI commands for inspecting and clearing audit reports directly in your terminal.

### 1. View Terminal Summary (`vendor/bin/typephp report`)

Display an ANSI color-formatted audit summary grouped by file:

```bash
vendor/bin/typephp report
```

#### Terminal Output
```text
  TYPEPHP  Violation Audit Report

  • Total Violations: 4
  • Files Affected:   3
  • Report Source:    var/typephp-report.json

  src/Services/PaymentService.php
    Line 42    parameter   $amount      expected positive-int, negative int (-50)

  src/Models/User.php
    Line 88    return      return       expected list<int>, App\Enums\Role returned

  src/Command/GetEntities.php
    Line 133   property    $default     expected array<string, mixed>, bool (false)

  src/Utils/Parser.php
    Line 56    variable    $config      expected positive-int, zero int (0)
```

> **Exit Code Behavior:** `vendor/bin/typephp report` returns exit code `0` if 0 violations were found, or exit code `1` if violations exist, allowing it to function as a standalone CI step.

### 2. Clear Report Files & Shards (`vendor/bin/typephp report:clear`)

Delete the generated report JSON file and purge temporary worker shards:

```bash
vendor/bin/typephp report:clear
```

---

## Public Facade API (`TypePHP`)

You can inspect, clear, or export violations programmatically using TypePHP's public static methods:

```php
use TypePHP\TypePHP;

// 1. Retrieve all in-memory violations recorded in the current process
/** @var list<\TypePHP\Internal\Reporting\ViolationRecord> $violations */
$violations = TypePHP::getViolations();

foreach ($violations as $v) {
    echo "{$v->file}:{$v->line} - {$v->message}\n";
}

// 2. Export consolidated master report file programmatically
TypePHP::exportReport('storage/reports/typephp-audit.json');

// 3. Reset in-memory violations
TypePHP::clearViolations();
```

---

## Environment Variable & `composer.json` Overrides

You can configure reporting options at any level without modifying source code:

### 1. Environment Variables (Highest Priority)
```bash
export TYPEPHP_ON_VIOLATION=report
export TYPEPHP_REPORT_FILE=var/typephp-report.json
export TYPEPHP_FAIL_ON_REPORT=true
```

### 2. Root `composer.json` (`extra.typephp`)
```json
{
  "extra": {
    "typephp": {
      "on-violation": "report",
      "report-file": "var/typephp-report.json",
      "fail-on-report": true
    }
  }
}
```

### 3. `typephp.php` Configuration File
```php
return [
    'on_violation'   => 'report',
    'report_file'    => __DIR__ . '/var/typephp-report.json',
    'fail_on_report' => false,
];
```

---

## GitHub Actions Annotation Integration (1-Liner)

You can convert `typephp-report.json` into inline pull request annotations on GitHub Actions using `jq`:

```yaml
- name: Run Pest Test Suite in Audit Mode
  run: ./vendor/bin/pest --compact
  env:
    TYPEPHP_ON_VIOLATION: 'report'
    TYPEPHP_REPORT_FILE: 'var/typephp-report.json'

- name: Annotate GitHub PR with TypePHP Violations
  if: always() && file_exists('var/typephp-report.json')
  run: |
    jq -r '.violations[] | "::warning file=\(.file),line=\(.line),title=TypePHP Violation::\(.message)"' var/typephp-report.json
```
