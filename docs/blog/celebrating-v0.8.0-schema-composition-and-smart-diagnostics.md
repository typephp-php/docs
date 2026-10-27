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

I have already been using TypePHP in almost all of my own PHP projects and daily development workflows. It has completely transformed how I write code, making me significantly more productive and giving me absolute confidence through extreme type safety. Finally being able to rely on typed arrays and true reified generics at runtime is an absolute game changer.

With the release of v0.8.0, the engine has reached a remarkable level of maturity. Over **1,270 tests** and **3,300 assertions** run flawlessly under PHPStan Level MAX strictness. The engine now fluently handles some of the most advanced type algebra in the PHP ecosystem.

Let's dive into what makes v0.8.0 my most powerful release yet.

---

## 1. Array Shape Composition (`ShapeA & ShapeB`)

In modular architectures, developers frequently compose schemas using intersections. Until now, intersecting *sealed* array shapes posed a theoretical contradiction: if `ShapeA` strictly forbids extra keys, and `ShapeB` strictly forbids extra keys, how can they ever merge?

In v0.8.0, TypePHP introduces **Schema Composition**. When you intersect multiple array shapes or object shapes, TypePHP seamlessly merges them into a unified composite schema at runtime.

Click **Run** below to test schema composition live:

<TypePHPSnippet title="Array Shape Composition (ShapeA & ShapeB)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @phpstan-type Identifiable array{id: positive-int, created_at: non-empty-string}
 * @phpstan-type Taggable     array{tags: list<non-empty-string>}
 * @phpstan-type ArticleShape Identifiable & Taggable
 *
 * @param ArticleShape $article
 */
function publishArticle(array $article): void
{
    echo "✓ Published Article #{$article['id']} with " . count($article['tags']) . " tag(s)\n";
}

// 1. Happy Path: Merges both schemas into a single valid composite shape
publishArticle([
    'id' => 101,
    'created_at' => '2026-09-15',
    'tags' => ['php', 'release', 'typephp'],
]);

echo "\n";

// 2. Missing Composed Key: Omitting 'tags' from Taggable fails
try {
    publishArticle([
        'id' => 101,
        'created_at' => '2026-09-15',
    ]);
} catch (\TypeError $e) {
    echo "✗ Missing key from composed schema:\n   " . $e->getMessage() . "\n\n";
}

// 3. Sealed Safety: Extra unexpected keys not in either schema are strictly rejected!
try {
    publishArticle([
        'id' => 101,
        'created_at' => '2026-09-15',
        'tags' => ['release'],
        'unregistered_key' => true,
    ]);
} catch (\TypeError $e) {
    echo "✗ Sealed composition rejected unsealed key:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

If intersected shapes declare the same key with different constraints (e.g., `score: int` and `score: positive-int`), TypePHP intelligently unifies them into a combined intersection constraint (`score: int & positive-int`).

---

## 2. Intelligent Union & Intersection Diagnostics

Discriminated unions (also known as tagged unions) are the industry standard for handling varying API payloads, domain events, and state machines.

```php
/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void { ... }
```

In previous versions, if you passed a `'hover'` event but accidentally left the `element` string empty, TypePHP would evaluate the first branch (`'click'`), fail, and erroneously report: *"Argument $event['type'] must be literal 'click'"*. This false-positive blame was incredibly frustrating.

In v0.8.0, I completely rewrote the union validation logic with a **Discriminator-Aware Diagnostic Engine**:
1. TypePHP now scans union branches for literal discriminator fields (like `'type' => 'hover'`).
2. If your input matches a specific branch's discriminator, TypePHP isolates that branch and diagnoses the **exact failing field** within it.
3. If an input matches zero discriminators, it falls back to reporting the full union contract.

Test both discriminator branch isolation and full intersection reporting live:

<TypePHPSnippet title="Discriminator-Aware Union & Intersection Diagnostics" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void
{
    echo "✓ Handled event '{$event['type']}'\n";
}

/**
 * @param Countable&ArrayAccess $collection
 */
function verifyIntersection(object $collection): void
{
    echo "✓ Verified intersection: implements Countable & ArrayAccess\n";
}

// 1. Happy Path: Valid event payloads
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'hover', 'element' => 'btn-submit']);

echo "\n";

// 2. Discriminator-Aware Isolation:
// Matches 'hover' discriminator, pinpointing empty 'element' rather than blaming 'click'!
try {
    handleEvent(['type' => 'hover', 'element' => '']);
} catch (\TypeError $e) {
    echo "✗ Targeted discriminator failure:\n   " . $e->getMessage() . "\n\n";
}

// 3. Unrecognized Discriminator Fallback:
// 'swipe' matches no valid branch, reporting the complete union contract:
try {
    handleEvent(['type' => 'swipe', 'distance' => 50]);
} catch (\TypeError $e) {
    echo "✗ Unrecognized discriminator fallback:\n   " . $e->getMessage() . "\n\n";
}

// 4. Complete Intersection Contract Reporting:
// Matches PHP 8.1+ native behavior by reporting the full intersection contract!
class CountableOnly implements Countable { public function count(): int { return 0; } }
try {
    verifyIntersection(new CountableOnly());
} catch (\TypeError $e) {
    echo "✗ Intersection error formatting:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## 3. Conditional Parameters (`$mode is 'json' ? array : string`)

TypePHP already supported conditional return types. In v0.8.0, I brought that same dynamic evaluation engine to **function and method parameters**.

You can now enforce that a parameter's expected type strictly depends on the runtime value of an earlier parameter, or on an inferred generic template `T`.

This feature fully supports nested multi-branch conditionals, negated conditions (`is not`), boolean flags, and PHP 8.0+ named arguments passed in swapped order:

<TypePHPSnippet title="Conditional Parameters ($format is 'json' ? A : B)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * Expected type of $payload strictly depends on $format:
 *
 * @param 'json'|'xml' $format
 * @param ($format is 'json' ? array<string, mixed> : non-empty-string) $payload
 */
function sendPayload(string $format, mixed $payload): void
{
    if (is_array($payload)) {
        echo "✓ Dispatched JSON payload with " . count($payload) . " field(s)\n";
    } else {
        echo "✓ Dispatched XML string: {$payload}\n";
    }
}

// 1. Format 'json' -> requires array
sendPayload('json', ['status' => 'ok', 'code' => 200]);

// 2. Format 'xml' -> requires non-empty-string
sendPayload('xml', '<response><status>ok</status></response>');

// 3. Named arguments passed in swapped order are fully resolved!
sendPayload(payload: ['status' => 'swapped'], format: 'json');

echo "\n";

// 4. Failure: Passing string when format is 'json'
try {
    sendPayload('json', '{"status":"ok"}');
} catch (\TypeError $e) {
    echo "✗ JSON branch violation:\n   " . $e->getMessage() . "\n\n";
}

// 5. Failure: Passing empty string when format is 'xml'
try {
    sendPayload('xml', '');
} catch (\TypeError $e) {
    echo "✗ XML branch violation:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## 4. Deep Property Chain Integrity (4+ Levels Deep)

As developers build increasingly complex DTOs and deeply nested JSON structures, error diagnostics must remain pristine. I audited and fortified the diagnostic engine to ensure that deep property breadcrumbs remain 100% accurate, no matter how deep the chain goes.

Whether the failure is a type mismatch, a deep missing property, or an uninitialized PHP 8.1+ readonly property, TypePHP pinpoints the exact object and field responsible for the crash:

<TypePHPSnippet title="Deep Property Chain Breadcrumbs (4 Levels Deep)" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

/**
 * 4-level deep nested object shape contract:
 *
 * @param object{company: object{department: object{lead: object{name: non-empty-string}}}} $user
 */
function assignLead(object $user): void
{
    echo "✓ Assigned lead: {$user->company->department->lead->name}\n";
}

// 1. Happy Path: All 4 levels are valid
$validUser = (object) [
    'company' => (object) [
        'department' => (object) [
            'lead' => (object) [
                'name' => 'Alice Johnson',
            ],
        ],
    ],
];
assignLead($validUser);

echo "\n";

// 2. Deep Field Type Failure (Empty string 4 levels down):
try {
    $badNameUser = (object) [
        'company' => (object) [
            'department' => (object) [
                'lead' => (object) [
                    'name' => '', // Fails non-empty-string!
                ],
            ],
        ],
    ];
    assignLead($badNameUser);
} catch (\TypeError $e) {
    echo "✗ Deep field error diagnostic:\n   " . $e->getMessage() . "\n\n";
}

// 3. Deep Missing Property ('lead' is omitted 3 levels down):
try {
    $missingPropUser = (object) [
        'company' => (object) [
            'department' => (object) [
                // 'lead' is missing!
            ],
        ],
    ];
    assignLead($missingPropUser);
} catch (\TypeError $e) {
    echo "✗ Deep missing property diagnostic:\n   " . $e->getMessage() . "\n";
}
```

</TypePHPSnippet>

---

## 5. Zero-I/O Production Cache Mode

TypePHP operates flawlessly in CI/CD and local development, but in high-throughput production environments (like Laravel Octane or FrankenPHP), checking `@filemtime` on 1,000+ files per request to detect AST cache invalidation adds unnecessary disk I/O latency.

In v0.8.0, I introduced a dedicated **Production Zero-I/O Flag**:

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