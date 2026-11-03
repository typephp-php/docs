---
title: "Making Illegal States Impossible: In-Place Typestates in Pure PHP"
description: "Why C#, Java, and Rust cannot mutate generic types in-place, the deep computer science behind Typestate-Oriented Programming, and how TypePHP reifies mutable generics at runtime in pure PHP."
date: 2026-11-04
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# Making Illegal States Impossible: In-Place Typestates in Pure PHP

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-guide">Deep Dive</span>
  <span>November 4, 2026</span>
  <span class="dot">•</span>
  <span>7 min read</span>
</div>

Every developer has written some version of this nightmare:

```php
$db->table('users')->delete(); 
// Congratulations, you just wiped production on a Friday afternoon because you forgot where()
```

Or this classic:

```php
$tx->commit();
$tx->commit();
 // Fatal Error: No active transaction (and also no remaining dignity)
```

Or how about this universal gem?

```php
$user = $session->getUser(); // Might be a User object, or might be null. Who knows? Spin the wheel!
if (!$user) {
    // We defensively copy-paste this check into 40 different controllers just to sleep at night...
}
```

These bugs exist because of a fundamental architectural blind spot we have politely ignored for decades: **an object's type has zero idea what state it is actually in.**

A closed `File` object will still cheerfully offer you a `read()` method. A `QueryBuilder` with zero fitlers will happily execute `delete()`. An idle database conection will smile and pretend it can `commit()`. The type system just sits there, sips its coffee, shrugs, and says: *"Sure, looks valid to me!"*

For nearly forty years, computer scientists have chased a holy grail designed to end this madness: **Typestate-Oriented Programming**, the radical, mind-bending proposition that an object's type should actually reflect its current state.

Mainstream languages looked at this idea, nodded thoughtfully in academic conferences, and then did everything in their power to avoid implementing it properly. C# freezes the type in carbonite. Rust destroys the value and runs away with it. Static analyzers wave their hands and pray CI catches it.

And then there is TypePHP, which looked at the problem and asked: *"What if we just mutated the generic type in place at runtime? In pure, unadulterated PHP?"*

---

## 1. The Typestate Dream and the Language Compromises

In 1986, Robert Strom and Shaula Yemini published *["Typestate: A programming language concept for enhancing software reliability"](https://doi.org/10.1109/TSE.1986.6312929)* [1]. In 2009, Jonathan Aldrich’s research team at Carnegie Mellon took the concept and gave it a formal name: **Typestate-Oriented Programming (TSOP)** with the experimental language Plaid.

The premise is almost insultingly simple:

```text
ClosedFile  ──( open() )──►  OpenFile  ──( close() )──►  ClosedFile
```

When a file is closed, the `read()` method simply does not exist on the type. Calling it is a loud, impossible type error, not an embarrassing surprise at 3:00 AM in production.

Mainstream languages, however, treated this like a polite suggestion they had no intention of following.

---

### A. C#: "We Can Emulate It" (By Committing Identity Theft)

A seasoned C# or Java developer will immediately interject: *“Excuse me, you can totally do typestates in C#!”*

Yes, technically. By throwing your original object directly into the incinerator and spawning a brand-new twin:

```csharp
public class UnauthenticatedSession 
{
    public AuthenticatedSession Login(string user, string pass) 
    {
        return new AuthenticatedSession(user); // Out with the old, in with the new, object identity be damned!
    }
}
```

This is not in-place typestate mutation. This is identity theft with extra steps.

Three stubborn problems remain:

1. **Object identity is destroyed.** You allocate a completely new heap object. The original never changed its type; it just became expensive garbage.
2. **The shared-reference model is broken.** In everyday software, we assume that when the state of an object changes, every other variable pointing at that object will observe the new behavior. Replacement-object patterns quietly violate that trust. One variable gets the shiny new authenticated session, while every other service holding the old reference is left holding a stale, unauthenticated ghost.
3. **The CLR simply will not allow true in-place change.** Generics are riefied. The method table pointer lives directly in the object header. Field offsets like `[RCX + 16]` are baked into the compiled machine code. Mutating the generic parameters of a live object in place would scramble memory offsets and crash the virtual machine. The runtime would rather die than let you do this.

C# can *simulate* state transitions by playing musical chairs with replacement objects. It cannot evolve the type of a single shared reference while preserving the natural expectation that all aliases see the new state.

---

### B. Rust: "Just Destroy the Old Value and Move On"

Rust implements typestates with zero-sized marker types, which is deeply elegant until you realize how it actually treats your data: like an angry toddler with trust issues.

```rust
impl File<ClosedState> {
    pub fn open(self) -> File<OpenState> { ... } // Consumes `self`. Permanently.
}
```

Look at that signature. Calling `file.open()` does not mutate the file. It *eats* the file, deletes the evidence, and hands you an entirely new object. The original variable is dead. If you dare try to use it again, `rustc` screams at you:
```text
error[E0382]: use of moved value: `file`
```

This is brilliant for writing operating systems, but it is hostile to normal object-oriented life.

If PHP adopted Rust's model, every state transition would force an awkward reassignment dance: `$tx = $tx->begin()`. Idiomatic reference pasing and dependency injection would be dead on arrival. Rust solved the problem by fundamentally refusing to share toys with anyone.

---

### C. The Limits of Static Analysis (Psalm & PHPStan)

Psalm originally pioneered this space with `@psalm-this-out`, which was later introduced to PHPStan 1.9 by Richard van Velzen under the `@phpstan-self-out` banner. Both let a method declare that it changes `$this`’s generic type:

```php
/** @self-out self<Authenticated> */
public function login(): void { ... }
```

This was a genuine triumph for static analysis. But the limitation is structural: **static analyzers never actually run your code.**

They reason about source text, abstract syntax trees, and control-flow graphs. At runtime, DocBlocks are just nostalgic text comments. When un-sanitized HTTP payloads, dynamic DI containers, or shared references hit your application, static analyzers are sitting on the sidelines while your production server burns.

---

## 2. The TypePHP Breakthrough: Decoupled Reification via `\WeakMap`

TypePHP took those exact same static annotations, looked at PHP's dynamic object model, and said: *"What if we stop pretending and actually enforce this in RAM?"*

1. **Decoupled Identity:** The native PHP `zend_object` stays untouched. TypePHP stores generic type arguments in an external `\WeakMap` keyed by the instance.
2. **In-Place Mutation:** When a method annotated with `@self-out self<Authenticated>` finishes, TypePHP overwrites the type tag for that exact object in `\WeakMap` memory.
3. **Every Alias Sees the New State:** Because the object identity (`spl_object_id`) never changes, every variable that points at the instance immediately observes the updated typestate. 

No shiny new replacement objects. No destructive moves. No orphaned variables left stranded in outer scopes. Just the exact same object in heap memory, smoothly evolving into a new type, enforced everywhere it travels.

---

## 3. Static Analysis Meets Runtime Reality

Static analysis is great at catching typos before you commit. It is, by design, powerless to observe what actually happens to an object once the program is running.

We built a small typeatate machine that exercises three patterns that appear constantly in real production code:

1. Mutating `$this->state` inside transition methods.
2. Passing the object through an alias (`$shared = $alice`), the classic shared-reference case that most PHP code relies on.
3. Sending it through an untyped framework boundary (`untypedLayer(object $s)`).

The same code was analyzed by **PHPStan at Level MAX** and then executed under **TypePHP's live runtime engine**.

### What PHPStan Reports: 5 False Positives

![PHPStan reporting errors on the typestate example](/blog/the-curious-case-of-mutable-generics/phpstan-typestate-errors.png)

PHPStan surfaces a sea of red:

* **Inside `login()` and `logout()`:** PHPStan refuses to accept the assignments to `$this->state`, treating the generic property as an immutable museum artifact. Even in massive codebases like Nextcloud core (`Response.php`), developers are forced to write `/** @psalm-suppress InvalidPropertyAssignmentValue */` just to shut the linter up!
* **The Aliasing Blindspot:** After `$shared = $alice` and `$alice->login()`, PHPStan still insists `$shared` is unauthenticated. Flow analysis tracks variable *names*, not physical memory pointers, so the shared mutation is invisible to it.
* **The Opaque Boundary:** Once `$bob` passes through `untypedLayer(object $s)`, the static model loses the transition and blindly rejects the later vault access.

None of these are bugs in PHPStan. They are the natural consequence of a tool that inspects text without ever executing it.

---

### What Happens When the Code Actually Runs

![TypePHP executing the same code cleanly](/blog/the-curious-case-of-mutable-generics/typephp-typestate-success.png)

Now run the exact same code below inside TypePHP's live WebAssembly engine:

::: tip Try it yourself
1. Click **Run** below. All three accesses succeed cleanly with `Access granted!`, followed by line 92 halting with an uncaught `TypeError` because `$s1` logged out!
2. Click **Edit**, comment out line 90 (`$s1->logout();`), and run again. All four accesses now succeed with Exit 0!
3. [Open the exact same code in the PHPStan Playground](https://phpstan.org/r/54a4bc39-e250-4f4d-b649-d48f3af7727f) to see the 5 static false positives side by side.
:::

<TypePHPSnippet title="Typestate Example: Static Analysis vs Runtime" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

namespace App\TypestateTest;

interface State {}
class Unauthenticated implements State {}
class Authenticated implements State {}

/**
 * @template TState of State
 */
class Session
{
    /**
     * @var TState
     */
    public object $state;

    public function __construct()
    {
        $this->state = new Unauthenticated();
    }

    /**
     * @phpstan-self-out self<Authenticated>
     */
    public function login(): void
    {
        $this->state = new Authenticated();
    }

    /**
     * @phpstan-self-out self<Unauthenticated>
     */
    public function logout(): void
    {
        $this->state = new Unauthenticated();
    }
}

/**
 * Gatekeeper function: Strictly requires an Authenticated session!
 *
 * @param Session<Authenticated> $session
 */
function accessVault(Session $session): void
{
    echo "Access granted!\n";
}

// -------------------------------------------------------------
// 1. Direct Transition (Succeeds)
// -------------------------------------------------------------
$s1 = new Session();
$s1->login();
accessVault($s1);

// -------------------------------------------------------------
// 2. The Shared-Reference Case
// -------------------------------------------------------------
$alice = new Session();
$shared = $alice; // Points to the EXACT same instance in RAM!
$alice->login();

// TypePHP knows $shared points to the same authenticated heap instance.
// This matches the natural expectation when an object changes state.
accessVault($shared);

// -------------------------------------------------------------
// 3. Opaque Framework Boundary
// -------------------------------------------------------------
function untypedLayer(object $s): void
{
    if ($s instanceof Session) {
        $s->login();
    }
}

$bob = new Session();
untypedLayer($bob);

// At runtime, $bob physically logged in. TypePHP verifies its live state:
accessVault($bob);

// -------------------------------------------------------------
// 4. Runtime Gatekeeping (Catches actual unauthenticated access)
// -------------------------------------------------------------
$s1->logout();
echo "Attempting access after logout...\n";
accessVault($s1);
```

</TypePHPSnippet>

TypePHP succeeds here for three concrete reasons:

1. **Speculative Property Rollbacks:** When `$this->state = new Authenticated()` runs inside `login()`, TypePHP’s `InlineChecker::trySelfOutTransition()` speculatively tests the impending `@self-out` transition and allows the assignment without requiring ugly suppress comments.
2. **Heap Pointer Aliasing:** It keys state by `spl_object_id`. When `$alice->login()` runs, the physical instance updates, so `$shared` reflects the change immediately.
3. **Observing the Actual Heap:** It observes what physically happened in memory, not what a static symbol graph guessed.

---

## 4. Real-World Domain: Bulletproof Database Transactions

Database transactions are the gift that keeps on giving to incident reponse channels: call `commit()` twice or query an idle connection, and you get silent data corruption or loud exceptions.

::: tip Try it yourself
1. Click **Run** to watch the uncaught `TypeError` on line 45 when atempting to transfer funds on a committed transaction.
2. Click **Edit**, comment out line 41 (`$db->commit();`), and run again. The second transfer now succeeds with Exit 0!
:::

<TypePHPSnippet title="Database Transaction Typestates with @self-out" default-view="source">

```php:line-numbers
<?php

declare(strict_types=1);

use TypePHP\TypePHP;

interface TransactionState {}
class IdleState implements TransactionState {}
class ActiveState implements TransactionState {}
class CommittedState implements TransactionState {}

/**
 * @template TState of TransactionState
 */
class TransactionalConnection
{
    /** @self-out self<ActiveState> */
    public function begin(): void { echo "✓ BEGIN\n"; }

    /** @self-out self<CommittedState> */
    public function commit(): void { echo "✓ COMMIT\n"; }
}

class BillingService
{
    /** @param TransactionalConnection<ActiveState> $db */
    public function transferFunds(TransactionalConnection $db, int $amount): void
    {
        echo "✓ Transferred \${$amount} safely inside active transaction!\n";
    }
}

/**
 * @var TransactionalConnection<IdleState>
 */
$db = new TransactionalConnection();
$billing = new BillingService();

$db->begin();
$billing->transferFunds($db, 500); // Permitted!
$db->commit();

// Attempting to transfer on a committed transaction halts with TypeError:
echo "Attempting transfer on committed transaction...\n";
$billing->transferFunds($db, 250);
```

</TypePHPSnippet>

Notice what this eliminates:

* No defensive checks like `if (!$db->inTransaction())` scattered through business logic.
* No awkward `$db = $db->begin()` reassignment gymnastics.
* Passing an idle or already-committed connection into `transferFunds()` is an immediate, unbreachable `TypeError`.

---

## Conclusion: PHP’s Accidental Advantage

For over twenty years, computer science purists have treated PHP’s lack of native C-level reified generics as proof that it is a toy language for building simple websites.

That missing C-level rigidity turned out to be an unexpected gift:

* **C# and Swift** welded generic metadata into the heap header and locked it in carbonite forever.
* **Rust** chose affine ownership and forced you to destroy your data just to change its clothes.
* **TypePHP** took advantage of PHP's dynamic userland, decoupled generic metadata into `\WeakMap`, and simply mutated it in place, preserving the shared-reference model that PHP developers already take for granted.

The result is actual **in-place Typestate-Oriented Programming**: state machines enforced by structural type contracts, without breaking reference identity, running in 100% pure PHP.

Sometimes the language everyone calls "dumb" is the only one flexible enough to do the smart thing.

***

*Have a state machine or workflow you would like to model? Check the dedicated [Mutable Generics & Typestates Guide](/docs/generics/mutable-generics-and-typestates) or try it live in the [Interactive WebAssembly Playground](/playground).*