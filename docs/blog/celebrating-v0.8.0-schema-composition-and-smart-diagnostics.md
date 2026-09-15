---
title: "TypePHP v0.8.0: Schema Composition, Conditional Parameters, and Smart Diagnostics"
description: "Celebrating the release of v0.8.0! This release brings array shape composition, discriminator-aware union diagnostics, conditional parameters, and a zero-I/O production mode to the PHP ecosystem."
date: 2026-09-15
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# TypePHP v0.8.0: Schema Composition, Conditional Parameters, and Smart Diagnostics

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-announcement">Release</span>
  <span>September 15, 2026</span>
  <span class="dot">•</span>
  <span>6 min read</span>
</div>

Today, I am incredibly proud to announce the release of **TypePHP v0.8.0**. 

When I started TypePHP, my goal was simple: bring true runtime type safety to modern PHP without forcing developers to abandon their existing PHPDoc annotations, compile C-extensions, or adopt proprietary attributes. I wanted the PHPStan and Psalm contracts you already write to actually mean something when your code runs in production.

I have already been using TypePHP in almost all of my own PHP projects and daily development workflows. It has completely transformed how I write code and making me significantly more productive and giving me absolute confidence through extreme type safety. Finally being able to rely on typed arrays and true reified generics at runtime is an absolute game changer.

With the release of v0.8.0, the engine has reached a remarkable level of maturity. Over **1,270 tests** and **3,300 assertions** run flawlessly under PHPStan Level MAX strictness. The engine now fluently handles some of the most advanced type algebra in the PHP ecosystem.

Let's dive into what makes v0.8.0 my most powerful release yet.

---

## 1. Array Shape Composition (`ShapeA & ShapeB`)

In modular architectures, developers frequently compose schemas using intersections. Until now, intersecting *sealed* array shapes posed a theoretical contradiction: if `ShapeA` strictly forbids extra keys, and `ShapeB` strictly forbids extra keys, how can they ever merge?

In v0.8.0, TypePHP introduces **Schema Composition**. When you intersect multiple array shapes or object shapes, TypePHP seamlessly merges them into a unified composite schema at runtime.

```php
/**
 * @phpstan-type Identifiable array{id: positive-int}
 * @phpstan-type Taggable     array{tags: list<string>}
 * @phpstan-type ArticleShape Identifiable & Taggable
 *
 * @param ArticleShape $article
 */
function publishArticle(array $article): void { ... }

// Valid: TypePHP merges the schemas into array{id: positive-int, tags: list<string>}
publishArticle([
    'id' => 101,
    'tags' => ['php', 'release'],
]);

// Invalid: The merged shape is sealed. Unexpected keys are strictly forbidden!
publishArticle([
    'id' => 101,
    'tags' => ['php'],
    'unregistered_key' => true,
]);
// Throws: TypeError: Argument $article contains unsealed unexpected key 'unregistered_key'
```

If intersected shapes declare the same key with different constraints (e.g., `score: int` and `score: positive-int`), TypePHP intelligently unifies them into a combined intersection constraint (`score: int & positive-int`).

---

## 2. Intelligent Union & Intersection Diagnostics

Discriminated unions (also known as tagged unions) are the industry standard for handling varying API payloads, domain events, and state machines.

```php
/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string} $event
 */
function handleEvent(array $event): void { ... }
```

In previous versions, if you passed a `'hover'` event but accidentally left the `element` string empty, TypePHP would evaluate the first branch (`'click'`), fail, and erroneously report: *"Argument $event['type'] must be literal 'click'"*. This false-positive blame was incredibly frustrating.

In v0.8.0, I completely rewrote the union validation logic with a **Discriminator-Aware Diagnostic Engine**:
1. TypePHP now scans union branches for literal discriminator fields (like `'type' => 'hover'`).
2. If your input matches a specific branch's discriminator, TypePHP isolates that branch and diagnoses the **exact failing field** within it.

```php
handleEvent([
    'type' => 'hover',
    'element' => '', // Fails non-empty-string!
]);

// Beautiful, accurate diagnostics:
// Throws: TypeError: Argument $event['element'] must be of type non-empty-string, empty string ('') given
```

And if you pass an entirely unrecognized discriminator (e.g., `'type' => 'unknown'`), TypePHP gracefully falls back to reporting the full union contract, clearly communicating that the payload matched zero valid branches.

**Intersection Error Formatting**  
Beyond unions, I've also drastically improved error message formatting for intersection types. Instead of leaking a single failing interface on shallow type mismatches, TypePHP now reports the complete intersection contract (e.g., `must be of type (Countable & Iterator)`), perfectly matching PHP 8.1+ native behavior while preserving deep property errors for intersected shapes.

---

## 3. Conditional Parameters (`$mode is 'json' ? array : string`)

TypePHP already supported conditional return types. In v0.8.0, I am bringing that same dynamic evaluation engine to **function and method parameters**.

You can now enforce that a parameter's expected type strictly depends on the runtime value of an earlier parameter, or on an inferred generic template `T`:

```php
/**
 * @param 'json'|'xml' $format
 * @param ($format is 'json' ? array<string, mixed> : string) $payload
 */
function sendPayload(string $format, mixed $payload): void { ... }

// Evaluates $payload contract as array<string, mixed>
sendPayload('json', ['status' => 'ok']); 

// Invalid: The format is 'json', so payload MUST be an array!
sendPayload('json', '<xml></xml>');
// Throws: TypeError: sendPayload(): Argument $payload must be of type array, string '<xml></xml>' given
```

This feature fully supports nested multi-branch conditionals, negated conditions (`is not`), boolean flags, and PHP 8.0+ named arguments passed in swapped order.

---

## 4. Deep Property Chain Integrity (4+ Levels Deep)

As developers build increasingly complex DTOs and deeply nested JSON structures, error diagnostics must remain pristine. I audited and fortified the diagnostic engine to ensure that deep property breadcrumbs remain 100% accurate, no matter how deep the chain goes.

```php
/**
 * @param object{company: object{department: object{lead: object{name: non-empty-string}}}} $user
 */
function assignLead(object $user): void { ... }

// Invalid: Fails non-empty-string on the 4th level down
$user->company->department->lead->name = '';

assignLead($user);
// Throws: TypeError: assignLead(): Argument $user->company->department->lead->name must be of type non-empty-string
```

Whether the failure is a type mismatch, a deep missing property (`...->lead is missing required property 'name'`), or a deep uninitialized PHP 8.1+ readonly property, TypePHP pinpoints the exact object and field responsible for the crash.

---

## 5. Zero-I/O Production Cache Mode

TypePHP operates flawlessly in CI/CD and local development, but in high-throughput production environments (like Laravel Octane or FrankenPHP), checking `@filemtime` on 1,000+ files per request to detect AST cache invalidation adds unnecessary disk I/O latency.

In v0.8.0, I introduced a dedicated **Production Zero-I/O Flag**.

```php
// typephp.php
return [
    'cache' => true,
    'cache_check_mtime' => false, // Maximum Production Performance
];
```

When disabled, TypePHP generates a static hash based purely on the file path, loading the cached AST instantly from memory via PHP's OPCache. No `stat()` calls. No disk checks. Pure native execution speed.

*(Note: When using this mode, you must run `php vendor/bin/typephp cache:rebuild` in your deployment script).*

---

## The State of the Engine: The Road to 1.0

With v0.8.0, the architectural foundation of TypePHP feels incredibly solid. 

The `\WeakMap` engine successfully reifies generics with zero memory leaks. The `StreamWrapper` weaves AST checks dynamically with zero line-drift. TypePHP is natively parsing and enforcing types that traditional PHP developers could only dream of statically verifying.

As I look toward `v1.0.0`, my focus shifts from adding massive new architectural features to fine-tuning performance, expanding the framework integration guides (Laravel, Symfony, Shopware, Tempest), and gathering feedback from the community.

If you haven't tried TypePHP yet, there has never been a better time to drop it into your Pest or PHPUnit test suite:

```bash
composer require --dev typephp/typephp
vendor/bin/typephp config:init
```

Try it out, break things, and let me know what you think on [GitHub](https://github.com/typephp-php/typephp). 

Happy Coding!
