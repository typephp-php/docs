---
title: "From Sluggish to Blazing Fast: How I Made TypePHP 90x Faster and Uncovered 400+ 'DocBlock Lies' on Shopware 6"
description: "A deep-dive into how profiling TypePHP on Shopware 6 took the integration test suite from 3 hours down to minutes, and how runtime checking exposed over 1000+ dynamic DocBlock lies that static analysis tools couldn't catch."
date: 2026-08-30
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# From Sluggish to Blazing Fast: How I Made TypePHP 90x Faster and Uncovered 1000+ "DocBlock Lies" on Shopware 6

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-guide">Case Study</span>
  <span>August 30, 2026</span>
  <span class="dot">•</span>
  <span>9 min read</span>
</div>

When building a userland runtime contract engine for PHP, synthetic benchmarks on small scripts only tell 5% of the story. Toy benchmarks running 100 iterations of `positive-int` will always look blazing fast.

To discover where an engine truly breaks, and where PHP's static type system breaks down, you have to test it against an **enterprise open-source monolith**.

For TypePHP, that testing ground was **[Shopware 6](https://github.com/shopware/shopware)**, one of the largest, most sophisticated Symfony-based e-commerce architectures in the PHP ecosystem.

*(And to clear up any naming confusion: no, this is not that other project that transpiles PHP into C++ and forbids top-level code unless you write a `main()` entrypoint. Is PHP really so busted that someone felt the need to pretend it is C++ instead of just improving the language itself? This TypePHP is 100% pure PHP, built solely to elevate type safety and enforce contracts dynamically without changing the way you write PHP).*

The results? I took the CI test excecution times across the entire matrix from **hours down to just 4 to 6 minutes each (a ~90x speedup)**. Along the way, TypePHP caught **1,000+ runtime contract violations** in code that passed static analysis tools at maximum strictness with zero complaints and sometimes suppressed warnings.

---

## The Proof: GitHub Actions CI Comparison

Shopware's continuous integration workflow is divided across dozens of parallel matrix batches (`Core/Content`, `Core/Checkout`, `core-framework`, `migration`, `devops`). 

While these optimizations improved every batch across the entire workflow, I will focus specifically on `Core/Content` (1,680 integration tests on PHP 8.2 with MySQL 8.0) as the primary benchmark.

### Before: 3 Hours+ (PHPUnit Running for 2h 57m)
![Shopware CI Before Optimization](/blog/from-sluggish-to-blazing-fast/shopware-ci-before.png)
*Figure 1: Initial test run choking the CI runner, with PHPUnit taking 2 hours 57 minutes before timing out.*

<br>

### After: 4 Minutes+ Total (PHPUnit Running for 2m 36s)
![Shopware CI After Optimization](/blog/from-sluggish-to-blazing-fast/shopware-ci-after.png)
*Figure 2: The exact same test suite executing in just 2 minutes 36 seconds after static blueprint caching, zero-allocation hot paths, and trait call frame synchronization.*

---

## Part 1: The Math Behind the 3-Hour Freeze

In an enterprise test suite with 1,680 integration tests, methods and entity contructors are not called 10 times. They are called **hundreds of thousands of times**.

A micro-inefficiency of just **5 milliseconds** repeated 1,000,000 times equals:

$$1,000,000 \times 0.005\text{s} = \mathbf{5,000\text{ seconds (1.4 hours of wasted CPU time)}}.$$

To make TypePHP viable for massive real-world projects, I had to systematically eliminate four major architectural bottlenecks:

---

### Pillar 1: Static Class Blueprint Caching (Saved ~2.5 Hours)

#### The Bottleneck
Every time Shopware created or hydrated an entity (such as `new ProductEntity()`, `new Criteria()`, or `new EntityCollection()`):
1. `TemplateManager` inspected the object to discover generic template contracts.
2. It traversed the entire reflection hierarchy across all parents, interfaces, and traits.
3. It ran the **full PHPStan Lexer and AST Parser in RAM** on every single object instantiation to extract `@extends`, `@implements`, and `@use` tags.

In Shopware, about 1,000,000 entity and collection objects are created during a full test run:

$$1,000,000 \text{ objects} \times 5 \text{ DocBlocks per hierarchy} = \mathbf{5,000,000 \text{ AST parser runs in RAM!}}$$

#### The Solution: Static Blueprinting
A class's generic inheritance tree is **immutable during a single PHP request lifecycle**. `ProductEntity` does not change its parent class or interface contracts between test #1 and test #1,000.

I moved from per-instance parsing to **static class blueprinting**:

```
 [ Object Instantiation #1 ] ──► Compute Inheritance Blueprint ──► Cache in Static RAM
                                                                             │
 [ Objects #2 through #1,000,000 ] ──────────────────────────────────────────┘
 (0 Reflection, 0 Lexing, 0 AST Parsing: instant 1ns array copy into \WeakMap)
```

* **Invocation #1:** Computes template mappings once and caches them in `$classInheritedBindingsCache` and `$classHierarchyTemplatesCache`.
* **Invocations #2 to #1,000,000:** Fetch the pre-computed blueprint in static RAM and perform an instant copy into `\WeakMap`.
* **Impact:** Reduced ~2.5 hours of continuous AST re-parsing down to **~15 seconds total**.

---

### Pillar 2: Stopping the "Exception Serialization Cascade" (Saved ~30 Minutes)

When a test crashes with an unhandled exception, PHPUnit halts excecution, serializes the global state, copies stack traces, formats JUnit XML logs, and runs teardown hooks.

When thousands of false-positive exceptions throw inside tight database hydration loops, this serialization cascade completely freezes GitHub Actions runners. By fixing these resolution edge cases, tests executed on the clean happy path without trigering PHPUnit's heavy serialization subsystem.

---

### Pillar 3: Fixing the Asymmetric Generic Trait Memory Leak

When an application class used a generic Trait method (such as `ProductRepository` using `LoggerTrait`):
* `ParamChecker` pushed a generic call frame under the **calling class name** (`ProductRepository::log`).
* When the method exited, `ScopeCleaner` attempted to pop the frame under the **declaring trait name** (`LoggerTrait::log`).

Because the array keys did not match:
$$\text{Push Key: } \texttt{ProductRepository::log} \quad \neq \quad \text{Pop Key: } \texttt{LoggerTrait::log}$$

The call frame was **never popped**. Over 1,680 tests, hundreds of thousands of abandoned array frames leaked into `$callStackBindings`. This bloated process memory and forced Zend Engine's Garbage Collector into constant, slow full-heap sweep cycles.

I unified caller vs. trait resolution using a centralized `resolveEffectiveFunction()` helper across `setupScope()`, `ParamChecker`, and `ScopeCleaner`. Every generic call frame is now popped cleanly on method exit, keeping process memory completely flat.

---

### Pillar 4: Zero-Allocation Hot Path & Direct Dispatch

On high-frequency methods executed hundreds of thousands of times:
1. **Deferred String Construction:** Error messages and context paths (`"$function(): Argument $id"`) are formatted **only if a validation failure actually occurs**, eliminating over 2,000,000 throwaway string allocations on the happy path.
2. **Direct Dispatch for Identifiers:** Inlined direct routing for `IdentifierTypeNode` (which represents $>80\%$ of all types), bypassing dynamic `get_class()` lookups.

---

## Part 2: The Many Docblock lies Errors: When Reality Hits the "DocBlock Lie"

Once TypePHP was running at full native speed, PHPUnit began executing the actual test assertions, and immediately surfaced **1000+ runtime contract failures**.

Here are real snippets directly from the test run:

### Exhibit A: The Dynamic DI Container Generic Mismatch

```text
1) Shopware\Tests\Integration\Core\Content\ImportExport\Api\ImportExportFileApiTest::testImportExportFileSearch
TypePHP\Exception\TypeError: SalesChannelTrackingListener::__construct(): 
Argument $salesChannelRepository expects 
  EntityRepository<covariant SalesChannelCollection>, 
but 
  EntityRepository<EntityCollection<PartialEntity>> was given
in /var/cache/test/Container/Shopware_Core_KernelTestDebugContainer.php on line 7215
```

Look at what happened here:
1. `SalesChannelTrackingListener` declared in its DocBlock:  
   `/** @param EntityRepository<SalesChannelCollection> $salesChannelRepository */`
2. At compile time, static analysis tools read this annotation, nod approvingly, and mark the code as 100% clean.
3. At runtime, Symfony's compiled Dependency Injection container dynamically instantiates an `EntityRepository` configured with `EntityCollection<PartialEntity>`.

The DocBlock claimed one thing. The compiled DI container physicaly injected another. **The DocBlock was a lie, and static analysis was completely blind to it.**

---

### Exhibit B: The Array Key Assumption

```text
3) Shopware\Tests\Integration\Core\Content\ImportExport\Api\ImportExportFileApiTest::testImportExportFileList
TypePHP\Exception\TypeError: SystemConfigLoader::getSubArray(): 
Argument $value key must be of type string, zero int (0) given
in /src/Core/System/SystemConfig/SystemConfigLoader.php on line 72
```

Here, `SystemConfigLoader::getSubArray()` documented its parameter as an associative string-keyed map (`array<string, mixed>`).

At runtime, cached configuration structures and nested arrays physicaly contained integer keys (`0 => ...`). In production, this can lead to silent data truncation when functions like `array_merge()` or key-sensitive array iterators treat string keys and integer keys with completely different semantics.

---

## Why Static Analysis Tools Alone Are Not Enough

There is a popular dogma in the PHP community:

> *"Why would anyone need runtime type checks in PHP? Just run static analysis tools at maximum strictness, write clean DocBlocks, and you have 100% type safety!"*

**This is a dangerous illusion.**

Static analysis tools (PHPStan, Psalm, Mago, Phan) are exceptional at linting syntax, catching typos, and verifying static call graphs. But static analyzers operate in an idealized compile-time world that **does not exist during live execution**:

| What Static Analysis Tools Cannot See | Real-World Failure Scenario |
| :--- | :--- |
| **Dynamic Dependency Injection** | Compiled DI containers, synthetic services, and decorated factories |
| **Un-sanitized External Payloads** | JSON payloads, Stripe webhooks, and third-party HTTP API responses |
| **Dynamic Database & Cache Records** | Redis arrays, PDO associative rows, and serialized session state |
| **Dynamic Runtime Configuration State** | Runtime system config loaders, feature flags, and environment vars |
| **Dynamic Test Mocks & Doubles** | Anonymous mock objects, and dynamic runtime proxy classes |
| **Runtime Generic Mutations** | Objects pushed into collections downstream after type erasure |

A DocBlock is a **wish**. Static analysis checks if your code is consistent with your wishes. **TypePHP verifies whether reality actually matches what you wished for.**

::: tip A Direct Challenge
I dare you to run TypePHP in your codebase, even if it already pases static analysis tools at maximum strictness. You will be surprised by how many hidden type errors and DocBlock lies surface the moment your code actually executes in real time.
:::

---

## PHP is Not Slow

There is another misconception that running heavy AST inspection and runtime validation in pure PHP userland is inherently doomed to be slow.

> *"PHP is not slow. PHP is remarkably fast when you write and architect your code with respect to the Zend Engine, memory allocations, and static memoization."*

TypePHP does not require custom C-extensions, Rust/C FFI bindings, or modified PHP binaries. It runs 100% in pure PHP userland, yet it easily sustains **over 460,000 type checks per second** in single-threaded execution when memory acess patterns and static blueprints are respected.

---

## A Special Thank You to Michael Telgmann & Shopware 6

I want to give a massive, heartfelt thank you to **Michael Telgmann** from the Shopware core team for trying and testing TypePHP against Shopware 6's continuous integration test suite.

Setting up TypePHP on Shopware's GitHub Actions pipeline provided the exact real-world crucible this engine needed. Shopware is an incredible, modern engineering platform, and runing against its full test suite forced me to build an engine capable of handling genuine architectural complexity:
* Multi-tier generic class hierarchies (`EntitySearchResult<TEntityCollection>`)
* Deep Symfony DI container compilation and runtime service wiring
* PHP 8.1+ attribute constructors with shifted parameter lists
* Massive runtime entity collections and hydration loops

Without Michael running TypePHP on Shopware 6, these performance bottlenecks, memory leaks, and subtle DocBlock edge cases would have taken me months to uncover.

---

## The Takeaway: Static Analysis + Runtime Verification

Static analysis and runtime contract enforcement are not rivals; they are **complementary partners**:

* **Use static analysis tools in your IDE and CI** to catch static logic flaws before your code ever runs.
* **Use TypePHP during Pest / PHPUnit test runs and CI pipelines** to guarantee that your dynamic data, compiled containers, and generic collections withstand reality.

### Get Started in 30 Seconds

```bash
composer require --dev typephp/typephp
vendor/bin/typephp config:init
```

Run your test suite:

```bash
./vendor/bin/pest
./vendor/bin/phpunit
```

Every parameter contract, array shape, and generic container in your application is now actively defended by runtime type safety!

*Have an edge case or massive codebase you'd like to benchmark? [Open an issue or join the discussion on GitHub!](https://github.com/typephp-php/typephp)*
