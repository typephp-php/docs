# Violation Reporting & Auditing

TypePHP provides three violation handling strategies (`throw`, `report`, and `warn`) allowing you to choose how contract failures are handled at runtime. 

In addition to acting as a strict fail-fast gatekeeper, TypePHP can run as a **non-fatal codebase auditor**, collecting all type discrepancies across an entire test suite, monorepo, or staging application into a single structured JSON report without halting execution.

---

## Overview of Violation Strategies

You can configure the active handling strategy via `'on_violation'` in `typephp.php`, through `composer.json` (`extra.typephp.on-violation`), or via environment variables:

| Strategy | Behavior | Best Used For |
| :--- | :--- | :--- |
| **`'throw'`** *(Default)* | Throws `TypePHP\Exception\TypeError` on the first violation. | Production gatekeeping, local feature development, and strict test suites. |
| **`'report'`** | Suppresses exceptions; records all unique violations into memory, tracks occurrence frequencies, and exports a structured JSON report to `report_file` at shutdown. | 1-pass codebase audits, legacy migration, multi-module test runs, and non-blocking CI build gates. |
| **`'warn'`** | Suppresses exceptions; emits a native PHP `E_USER_WARNING` with exact caller locations once per unique violation and continues execution normally. | Live staging logs, local dev server logs, and APM monitoring (Sentry / Datadog / Bugsnag). |

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
2. **$O(1)$ Deduplication & Occurrence Counting:** Repeated violations inside loops (e.g. iterating 50,000 array items) are deduplicated in RAM while accumulating an accurate occurrence `count`.
3. **Deep Diagnostic Tracking:** Pinpoints the exact violation site, calling frame (`caller`), and the originating DocBlock declaration site (`declared_in`) for rapid triage.
4. **Shutdown JSON Export:** At script completion, TypePHP exports all collected violations into a structured JSON report file.

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

### Location-Aware Warnings & Log Spam Prevention

To prevent log files from bloating when a violation occurs inside a high-volume loop, TypePHP **deduplicates warnings in static memory**. 

The first time a specific violation occurs, TypePHP emits `E_USER_WARNING` annotated with the exact caller location:

```text
PHP Warning:  [TypePHP Violation] UserService::findUser(): Argument $id must be of type positive-int, negative int (-5) given, called in /app/src/Controllers/UserController.php on line 42
```

Subsequent occurrences of the exact same violation in the same process are handled silently in $O(1)$ constant time.

---

## JSON Report Document Schema

When `'report_file'` is generated, TypePHP outputs a versioned, machine-readable JSON schema designed for both human review and automated tooling:

```json
{
  "version": "1.0",
  "generated_at": "2026-10-06T16:24:00+00:00",
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
      "count": 120,
      "caller": "tests/Feature/PaymentTest.php:100 (Tests\\PaymentTest::testCharge())",
      "declared_in": "src/Contracts/PaymentInterface.php:15",
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
      "count": 1,
      "caller": "src/Controllers/UserController.php:45 (App\\Controllers\\UserController::index())",
      "declared_in": "src/Models/User.php:80",
      "message": "App\\Models\\User::assignableRoles(): Return value[0] must be of type int, App\\Enums\\Role returned"
    },
    {
      "file": "src/Command/GetEntities.php",
      "line": 133,
      "function": "App\\Command\\GetEntities::$maxValue",
      "kind": "property",
      "target": "$maxValue",
      "expected": "int",
      "given": "float (99.999)",
      "count": 5,
      "caller": "src/Command/GetEntities.php:130 (App\\Command\\GetEntities::execute())",
      "declared_in": "src/Fields/TextInputField.php:32",
      "message": "Property App\\Command\\GetEntities::$maxValue must be of type int, float (99.999) given"
    },
    {
      "file": "index.php",
      "line": 12,
      "function": "App\\Models\\Person::$name",
      "kind": "property",
      "target": "$name",
      "expected": "non-empty-string",
      "given": "empty string ('')",
      "count": 1,
      "caller": null,
      "declared_in": "src/Models/Person.php:8",
      "message": "Property App\\Models\\Person::$name must be of type non-empty-string, empty string ('') given"
    }
  ]
}
```

### Schema Field Reference

| Field | Type | Description |
| :--- | :--- | :--- |
| **`"file"`** | `string` | Project-relative path where the violation was evaluated. |
| **`"line"`** | `int` | Physical line number where the violation occurred at runtime. |
| **`"function"`** | `string` | Method, function, or property target identifier (`Class::method` or `Class::$property`). |
| **`"kind"`** | `string` | Violation category (see Taxonomy table below). |
| **`"target"`** | `string` | The parameter name (`$id`), property name (`$maxValue`), or `'return'`. |
| **`"expected"`** | `string` | Expected type contract string (`positive-int`, `list<int>`, `array{...}`). |
| **`"given"`** | `string` | Formatted representation of the invalid runtime value. |
| **`"count"`** | `int` | Number of times this exact violation was triggered during execution. |
| **`"caller"`** | `string\|null` | Calling invocation frame (`file:line (Class::method())`). Returns `null` if the violation took place in root script scope (`{main}`) or has no outer calling function. |
| **`"declared_in"`** | `string\|null` | File and exact line where the DocBlock was physically declared (tracing traits, parent classes, and tokenized property definitions). |
| **`"message"`** | `string` | Complete diagnostic error message. |

---

## Understanding Location Diagnostics: The Tri-Part Model

To make auditing large codebases fast and actionable, TypePHP tracks three distinct location coordinates for every reported violation:

```
┌────────────────────────────────────────────────────────┐
│ 1. declared_in: src/Contracts/OrderInterface.php:15     │  <-- Where the contract is defined
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│ 2. file:line   : src/Services/OrderService.php:42      │  <-- Where the contract was violated
└────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│ 3. caller      : tests/OrderTest.php:100 (testPay())    │  <-- Who triggered the execution
└────────────────────────────────────────────────────────┘
```

### 1. Violation Site (`"file"` and `"line"`)
Identifies **where the invalid data was received or assigned**.
* For parameter checks: the call site or method entry point.
* For return checks: the `return` statement line.
* For property assignments: the exact line where `$obj->prop = $val` occurred.
* For inline variables: the assignment line where `$var = $val` occurred.

### 2. Declaration Site (`"declared_in"`)
Identifies **where the DocBlock contract is physically authored**.
* Resolves across inheritance hierarchies, interfaces, and traits.
* If a method in `ChildService` has no DocBlock but inherits `@param positive-int $id` from `ParentInterface`, `declared_in` points to the exact line in `ParentInterface.php`.
* For properties, TypePHP uses high-speed token inspection to locate the exact property declaration line rather than falling back to the top of the class.

### 3. Calling Frame (`"caller"`)
Identifies **which function or method invoked the operation**.
* **Distinguishable Naming:** Caller functions and methods are suffixed with `()` (e.g. `(App\Controllers\UserController::index())` or `(run())`), clearly differentiating callable invocation points from class names or property references.
* **Why `"caller"` can be `null`:** 
  A caller represents an *invoking frame* on the call stack. When an action occurs at the **root/global script level (`{main}`)**—such as initializing an inline variable or assigning a property directly in `index.php` or a bootstrap script—no outer function invoked that line. 
  
  In this case, `caller` is intentionally `null`. Setting it to the same line would be redundant because `"file"` and `"line"` already point to the exact statement.

```php
// index.php
$person = new Person();
$person->name = ""; // Line 12
```
* `"file"` & `"line"`: `index.php:12` *(Where the assignment happened)*
* `"declared_in"`: `Person.php:8` *(Where /** @var non-empty-string */ was written)*
* `"caller"`: `null` *(Executed directly in global scope; no calling function)*

```php
// OrderService.php
class OrderService {
    public function update(): void {
        $person = new Person();
        $person->name = ""; // Line 14
    }
}

// Controller.php
$service->update(); // Line 50
```
* `"file"` & `"line"`: `OrderService.php:14` *(Where the assignment happened)*
* `"declared_in"`: `Person.php:8` *(Where /** @var non-empty-string */ was written)*
* `"caller"`: `Controller.php:50 (App\Controllers\Controller::index())` *(Who called update())*

---

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
2. **Automatic Map-Reduce Consolidation:** When `vendor/bin/typephp report` or `TypePHP::exportReport()` executes, TypePHP merges all worker shards, deduplicates identical violations, aggregates their occurrence counts, writes the master `typephp-report.json`, and cleans up the shard directory.

---

## Multi-Run Report Merging (`report:merge`)

When running test suites sequentially over separate modules (e.g. 20 separate PHPUnit passes in a monorepo), each run produces an independent report file. 

Use `report:merge` to consolidate multiple JSON reports into a single unified report:

```bash
vendor/bin/typephp report:merge module1.json module2.json module3.json --output=var/all-violations.json
```

### Merging to Standard Output (`STDOUT`)
When `--output` is omitted, `report:merge` streams the consolidated JSON directly to standard output:

```bash
vendor/bin/typephp report:merge suite_a.json suite_b.json > var/typephp-report.json
```

### Consolidation Guarantees
* **Deduplication:** Violations matching the same file, line, function, target, and type signature are combined into a single entry.
* **Occurrence Summing:** Occurrence counts (`count`) are summed together, allowing you to identify violations hit hundreds of times across different modules.

---

## Terminal CLI Commands

TypePHP provides native CLI commands for inspecting, merging, and clearing audit reports directly in your terminal.

### 1. View Terminal Summary (`vendor/bin/typephp report`)

Display an ANSI color-formatted audit summary grouped by file with occurrence counts and origin breadcrumbs:

```bash
vendor/bin/typephp report
```

#### Terminal Output
```text
  TYPEPHP  Violation Audit Report

  • Total Violations: 3
  • Files Affected:   2
  • Report Source:    var/typephp-report.json

  src/Services/PaymentService.php
    Line 42    parameter   $amount      expected positive-int, negative int (-50) (x120)
      ↳ caller: tests/Feature/PaymentTest.php:100 (Tests\PaymentTest::testCharge())
      ↳ declared in: src/Contracts/PaymentInterface.php:15

  src/Models/User.php
    Line 88    return      return       expected list<int>, App\Enums\Role returned
      ↳ caller: src/Controllers/UserController.php:45 (App\Controllers\UserController::index())
      ↳ declared in: src/Models/User.php:80

  index.php
    Line 12    property    $name        expected non-empty-string, empty string ('')
      ↳ declared in: src/Models/Person.php:8
```

> **Exit Code Behavior:** `vendor/bin/typephp report` returns exit code `0` if 0 violations were found, or exit code `1` if violations exist, allowing it to function as a standalone CI step.

### 2. Merge Multiple Reports (`vendor/bin/typephp report:merge`)

```bash
vendor/bin/typephp report:merge part1.json part2.json --output=var/typephp-report.json
```

```text
  TYPEPHP  Report Merge

  ✓ Merged 2 report file(s) into "var/typephp-report.json" (14 unique violation(s)).
```

### 3. Clear Report Files & Shards (`vendor/bin/typephp report:clear`)

Delete the generated report JSON file and purge temporary worker shards:

```bash
vendor/bin/typephp report:clear
```

```text
  TYPEPHP  Report Clear

  ✓ Cleared report file and temporary shards (3 file(s) removed).
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
    echo "{$v->file}:{$v->line} (x{$v->count}) - {$v->message}\n";
    if ($v->caller !== null) {
        echo "  Called by: {$v->caller}\n";
    }
    if ($v->declaredIn !== null) {
        echo "  Declared in: {$v->declaredIn}\n";
    }
}

// 2. Export consolidated master report file programmatically
TypePHP::exportReport('storage/reports/typephp-audit.json');

// 3. Reset in-memory violations
TypePHP::clearViolations();
```

---

## Environment Variable & `composer.json` Overrides

Configure reporting options at any level without modifying source code:

### 1. Environment Variables (Highest Priority)
```bash
export TYPEPHP_ON_VIOLATION=report
export TYPEPHP_REPORT_FILE=var/typephp-report.json
export TYPEPHP_FAIL_ON_REPORT=true
export TYPEPHP_REDACT_VALUES=true
```

### 2. Root `composer.json` (`extra.typephp`)
```json
{
  "extra": {
    "typephp": {
      "on-violation": "report",
      "report-file": "var/typephp-report.json",
      "fail-on-report": true,
      "redact-values": true
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
    'redact_values'  => false,
];
```

---

## GitHub Actions Annotation Integration (1-Liner)

You can convert `typephp-report.json` into rich inline pull request annotations on GitHub Actions using `jq`:

```yaml
- name: Run Pest Test Suite in Audit Mode
  run: ./vendor/bin/pest --compact
  env:
    TYPEPHP_ON_VIOLATION: 'report'
    TYPEPHP_REPORT_FILE: 'var/typephp-report.json'

- name: Annotate GitHub PR with TypePHP Violations
  if: always() && file_exists('var/typephp-report.json')
  run: |
    jq -r '.violations[] | "::warning file=\(.file),line=\(.line),title=TypePHP Violation (x\(.count))::\(.message) [Declared in: \(.declared_in // "n/a")]"' var/typephp-report.json
```
