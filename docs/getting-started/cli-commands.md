# CLI Commands Reference

TypePHP provides a CLI runner binary (`vendor/bin/typephp`) for executing standalone PHP scripts with on-the-fly type checking, displaying audit reports, and managing AST transformation caches and configuration.

---

## Executing Standalone Scripts (`<script.php>`)

Execute and type-check any standalone PHP script directly from the command line:

```bash
vendor/bin/typephp script.php
# or with a nested path:
vendor/bin/typephp scripts/benchmarks/benchmark.php
```

### Automatic Path Whitelisting

When you pass a target script directly to the CLI binary, TypePHP automatically includes and type-checks that file **even if it is not registered in `typephp.php` or falls outside your configured `include` paths**.

Any secondary files required or included by the target script will continue to respect your project's configured `include` and `exclude` paths.

---

## Viewing Audit Reports (`report`)

Display an ANSI color-formatted audit summary of recorded contract violations directly in your terminal:

```bash
vendor/bin/typephp report
```

### Terminal Output
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

### Exit Code & CI Gatekeeper Behavior
* **Exit Code `0`:** No violations exist in the report (or no report file exists).
* **Exit Code `1`:** One or more violations exist in the report.

This status code behavior allows `vendor/bin/typephp report` to function as a standalone non-blocking audit step in CI/CD build pipelines.

::: tip Full Audit & Sharding Guide
To learn more about configuring audit mode (`'on_violation' => 'report'`), parallel test worker sharding (Pest Parallel / ParaTest), and CI gatekeeping (`fail_on_report`), see the dedicated [Violation Reporting & Auditing](/core-concepts/violation-reporting) guide.
:::

---

## Clearing Audit Reports (`report:clear`)

Delete the generated `typephp-report.json` file and purge any temporary worker shards (`.typephp-shards/`):

```bash
vendor/bin/typephp report:clear
```

### Terminal Output
```text
  TYPEPHP  Report Clear

  ✓ Cleared report file and temporary shards (3 file(s) removed).
```

Use `report:clear` before initiating a new audit run or before committing code to ensure a fresh diagnostic state.

---

## Configuration Initializer (`config:init`)

Generate a default `typephp.php` configuration file populated with documented settings in your project root directory:

```bash
vendor/bin/typephp config:init
```

### Terminal Output
```text
  TYPEPHP  Configuration Initializer

  ✓ Created "typephp.php" in project root directory.
```

If `typephp.php` already exists, `config:init` preserves your existing file without overwriting it.

---

## Clearing Cache (`cache:clear`)

Wipe all transformed PHP files from the `typephp-cache/` disk directory:

```bash
vendor/bin/typephp cache:clear
```

### Terminal Output
```text
  TYPEPHP  Cache Clear

  ✓ Cleared 178 cached file(s).
```

Use `cache:clear` whenever you update TypePHP or change global configuration settings.

---

## Warming Cache (`cache:warm`)

Recursively scan your project directory for files matching your `typephp.php` `include` patterns and pre-transform them before opening web traffic:

```bash
vendor/bin/typephp cache:warm
```

### Terminal Output
```text
  TYPEPHP  Cache Warm-Up

  ................................................................................
  ................................................................................
  ..................

  ✓ Cache warm-up complete
    • Scanned:     178 file(s)
    • Transformed: 178 file(s)
    • Skipped:     0 file(s)
```

### Progress Indicators

* **`.` (Dot):** A file was successfully parsed, transformed, and cached to disk.
* **`s` (Skipped):** A file is already up-to-date in cache or matches an `exclude` pattern.

### Deployment Script Usage

Add `cache:warm` to your CI/CD or deployment pipeline (Forge, Envoyer, GitHub Actions) so the very first production HTTP request receives instant $O(1)$ native OPCache execution speed:

```bash
# In your deployment script:
php vendor/bin/typephp cache:warm
```

---

## Rebuilding Cache (`cache:rebuild`)

Wipe all existing cache files and immediately pre-transform the new release files in a single atomic command:

```bash
vendor/bin/typephp cache:rebuild
```

### Terminal Output
```text
  TYPEPHP  Cache Clear

  ✓ Cleared 178 cached file(s).

  TYPEPHP  Cache Warm-Up

  ................................................................................
  ................................................................................
  ..................

  ✓ Cache warm-up complete
    • Scanned:     178 file(s)
    • Transformed: 178 file(s)
    • Skipped:     0 file(s)
```

This is the recommended command for automated zero-downtime deployment scripts.

---

## Help Menu (`help`)

Display the interactive CLI runner help menu:

```bash
vendor/bin/typephp help
```

### Terminal Output
```text
  TYPEPHP  Runtime Type Checker

  USAGE
    vendor/bin/typephp <script.php>

  COMMANDS
    config:init    Generate default typephp.php configuration file
    report         Display audit report summary in terminal
    report:clear   Delete generated report file and shards
    cache:clear    Clear all cached transformed files
    cache:warm     Pre-transform and warm up cache for included files
    cache:rebuild  Clear and immediately warm up cache
    help           Display this help menu

  EXAMPLES
    vendor/bin/typephp config:init
    vendor/bin/typephp report
    vendor/bin/typephp index.php
    vendor/bin/typephp cache:rebuild
```