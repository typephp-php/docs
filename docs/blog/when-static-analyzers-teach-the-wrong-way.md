---
title: "When Static Analyzers Teach You the Wrong Way: The Dogma of Variance and the Pursuit of Working QA"
description: "Why static analyzers sometimes force developers into anti-patterns to satisfy theoretical purity, Cecil Curry's perspective from Beartype, and how runtime type checking restores sanity."
date: 2026-09-09
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# When Static Analyzers Teach You the Wrong Way: The Dogma of Variance and the Pursuit of Working QA

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-guide">Deep Dive</span>
  <span>September 9, 2026</span>
  <span class="dot">•</span>
  <span>9 min read</span>
</div>

We genuinely love static analysis. Tools like PHPStan, Psalm, and Python's Mypy have fundamentally transformed modern software development. They catch typos before you save, find dead code paths, and save us from countless embarrassing bugs before code ever reaches a pull request.

Yet there is an uncomfortable situation that almost every developer runs into sooner or later.

You are sitting at your desk on a Friday afternoon, writing clean, elegant code. You run your static analyzer, expecting green text, only to be greeted by a bright red wall of theoretical jargon. The tool insists that your completely safe, twenty-line class is committing architectural crimes against category theory.

To make the linter happy, you find yourself degrading clean types, inventing three useless interfaces, or turning strict types into `mixed`. 

In other words, the tool designed to make your code safer just bullied you into making your code worse.

Recently, I stubmbled upon in a lively [discussion](https://github.com/beartype/beartype/discussions/601) on GitHub around Beartype (the fast runtime type checker for Python), its creator Cecil Curry penned a brutally honest, deeply funny critique of this exact phenomenon. 

Let us look at why static analyzers sometimes get trapped in theoretical purity, how this problem quietly bites PHP developers, and how runtime type checking offers a pragmatic way forward.

---

## Act I: The Absurdity of a Harmless Search Method

Imagine you want to build a read-only collection of items. 

Because the collection only produces data, you declare it as covariant (`@template-covariant T`) so that callers can use natural subtyping. For instance, you want a function expecting a collection of `Animal` objects to happily accept your collection of `Dog` objects.

You also decide to add two simple, everyday lookup methods: `contains()` and `indexOf()`.

```php
<?php

declare(strict_types=1);

class Animal {}
class Dog extends Animal {}
class Piano {}

/**
 * A read-only collection of items
 *
 * @template-covariant T
 */
class ReadOnlyCollection
{
    /** @var array<int, T> */
    private array $elements = [];

    /**
     * Purely read-only. It just checks whether an item exists in the array.
     *
     * @param T $item
     */
    public function contains(mixed $item): bool
    {
        return in_array($item, $this->elements, true);
    }

    /**
     * @param T $item
     */
    public function indexOf(mixed $item): int|false
    {
        return array_search($item, $this->elements, true);
    }
}
```

Now, run this harmless, clean, read-only code through PHPStan at maximum strictness.

### The PHPStan Error Report

```text
 ------ -------------------------------------------------------------------------------------------------------------------------------------------- 
  Line   index.php                                                                                                                                   
 ------ -------------------------------------------------------------------------------------------------------------------------------------------- 
  :23    Template type T is declared as covariant, but occurs in contravariant position in parameter item of method ReadOnlyCollection::contains().  
         [Rule: generics.variance]
  :31    Template type T is declared as covariant, but occurs in contravariant position in parameter item of method ReadOnlyCollection::indexOf().   
         [Rule: generics.variance]
 ------ -------------------------------------------------------------------------------------------------------------------------------------------- 
```

Look at what is happening here.

The class is literally called `ReadOnlyCollection`. It does not modify `$elements`. It does not write a single byte to memory. All it does is ask PHP's internal array functions whether a value is present.

Yet PHPStan halts your build and screams `generics.variance` because of an inflexible academic formula:

$$\text{Parameter Position} = \text{Contravariant Position}$$
$$\text{Covariant Template } T + \text{Contravariant Position} = \mathbf{FATAL\ ERROR}$$

This is the software equivalent of a building inspector fining you for holding a fire extinguisher because, technically, you are carrying pressurized gas. The tool has zero awareness of what the method actually does. It sees an open parenthesis, spots `T` inside it, and rejects the entire class.

---

## Act II: The Four Bad Choices Developers Are Forced to Make

When faced with this error, you are trapped. To get your CI pipeline green, you are forced into one of four bad compromises:

### 1. Destroy Subtyping: Make the Class Invariant (`@template T`)
You delete `@template-covariant` and fall back to plain `@template T`.  
The consequence: you can no longer pass `ReadOnlyCollection<Dog>` where `ReadOnlyCollection<Animal>` is expected. You break Liskov Substitution across your entire domain logic simply because a search method exists.

### 2. Destroy Type Safety: De-Type the Parameter (`@param mixed $item`)
You change `@param T $item` to `@param mixed $item`.  
The consequence: you have actively made your software less safe. Now, neither your IDE nor your static analyzer will complain if someone accidentally writes:
```php
$dogs->contains(new Piano()); // The static analyzer stays completely silent!
```
Notice the irony: in order to satisfy a type-checking tool, you were forced to delete your types.

### 3. Architecture Explosion: The Multi-Interface Gymnastics
You copy compiled languages like Scala and invent complex method-level template bounds:
```php
/**
 * @template U
 * @param U $item
 */
public function contains(mixed $item): bool
```
Or you split a twenty-line class into three separate files: `ReadableCollection`, `SearchableCollection`, and `CollectionInterface`. You have now tripled your codebase to solve a problem that exists only inside the linter.

### 4. The Duct-Tape Ignore: Inline Comments, Global Config, or Baseline Files
You either slap an inline ignore comment right above every single inspection method:
```php
// @phpstan-ignore generics.variance
public function contains(mixed $item): bool
```
Or you open your `phpstan.neon` or `psalm.xml` configuration file and sweep the problem under the rug globally:
```neon
# phpstan.neon
parameters:
    ignoreErrors:
        - identifier: generics.variance
        # Or the classic raw regex:
        # - '#Template type .* is declared as covariant, but occurs in contravariant position#'
```
Or perhaps you take the modern route and generate a baseline file:
```bash
vendor/bin/phpstan analyse --generate-baseline
```

The consequence: it still feels completely broken and wrong.

Inline comments make your pristine domain classes look like a messy collection of hacks during code reviews. Suppressing the error globally turns your configuration file into a graveyard of silenced warnings, blinding the analyzer to actual, unintended type bugs elsewhere across your codebase.

Worst of all, if you are authoring an open-source package or a shared internal library, generating a `phpstan-baseline.neon` only hides the problem on your own repository. Your baseline file does not travel with your package when installed via Composer. The moment a downstream application installs your package and runs PHPStan on their project, the analyzer inspects your vendor class definitions and explodes with the exact same `generics.variance` errors in their CI pipeline.

As Cecil Curry pointed out, developers end up feeling forced to tell the tool to simply shut up already, purely because the static analyzer cannot tell the difference between harmless read-only inspection and catastrophic memory corruption.

---

## Act III: Cecil Curry's Epiphany on Static Dogma

This exact situation is not unique to PHP. It recently surfaced in the Python ecosystem within Beartype's community discussions.

A developer asked why Python's primary static analyzer, Mypy, threw a fit when they tried to pass an abstract class or protocol into a function accepting `proto: type[T]` (tracked under issue [mypy#4717](https://github.com/python/mypy/issues/4717)). Mypy banned it because abstract classes cannot be instantiated, ignoring the fact that the developer never wanted to instantiate it; they only wanted to pass the class token to run an `issubclass()` check.

Cecil Curry, the creator of Beartype, gave a delightfully candid answer:

> *"Mypy is dumb. You have now personally witnessed the truth of this. More generally, static type-checkers are dumb. Statically type-checking a dynamically interpreted language like Python is infeasible in both the average and worst case. Static type-checking only works under ideal theoretical conditions that do not exist in the real world.*
>
> *More generally, static type-checkers are ideological. They zealously believe in a monstrous vision of fanatical purity that doesn't actually coincide or intersect with the real world... Literally no one who is a breathing human cares whether T is bound to an ABC or not. Only typing purists care about that sort of nonsense.*
>
> *Beartype is not a language purist. Neither am I. All we care about is improving Python. Typing purity is the enemy of working QA.*
>
> *Whenever mypy complains about something stupid like this, it's best to just yell at mypy and tell it to 'Shut up already, you!' by appending a # type: ignore comment."*

Cecil pointed directly at the core problem: static analyzers are ideological because they have to be. 

---

## Act IV: To Be Fair to Static Analyzers

Let us take a step back and be completely fair to PHPStan, Psalm, and Mypy. Their authors are brilliant engineers, and their paranoia comes from an honest engineering challenge.

Static analyzers do not execute your application. They have no access to PHP's call stack, no access to system memory, and no way of knowing which database records will be loaded into an array on line 42.

They are trying to solve an impossible problem: mathematically proving that an interpreted, dynamic program will never crash, without ever running the program.

Because static analyzers are blind at runtime, they must assume the absolute worst-case scenario at all times. From the perspective of pure type theory, if a class declares a generic parameter as covariant, allowing `T` in a parameter creates a theoretical hole where a developer *could* write bad data. 

Since a static linter cannot follow the object through memory to see whether it actually mutates, its only option is total prohibition: ban the syntax entirely.

Their rigidity is not malicious; it is simply the only tool a compile-time analyzer has. But when theoretical proofs collide with practical application architecture, developers are the ones who suffer the headache.

---

## Act V: The Native PHP Return Covariance Reality

There is another massive disconnect between static rules and real-world PHP: the way PHP itself was designed.

Under the Liskov Substitution Principle, formalized by Barbara Liskov and Jeannette Wing in 1994, method return types are naturally covariant. A child class method is always allowed to return a narrower, more specific type than its parent.

In core PHP, full return type covariance was officially implemented in PHP 7.4 in November 2019 under the "Covariant Returns and Contravariant Parameters" RFC:

```php
class AnimalShelter {
    public function adopt(): Animal { ... }
}

class DogShelter extends AnimalShelter {
    // 100% valid native PHP 7.4+ syntax
    public function adopt(): Dog { ... }
}
```

Because native PHP returns have worked covariantly for years, PHP developers and framework authors in Laravel, Shopware, and Symfony naturally assume that returning a subtype is always valid.

When a framework author writes:
```php
/** @return EntityCollection<Entity> */
public function search(): EntityCollection
{
    return new ProductCollection(); // ProductCollection extends EntityCollection<ProductEntity>
}
```
They rarely write `<covariant Entity>` on the DocBlock because in their mental model, returns in PHP are already covariant. Static analyzers immediately flag this as an invariant violation. But the developers were not trying to break type theory; they were just writing natural PHP.

---

## Act VI: How TypePHP Restores Sanity at Runtime

This is where runtime type checking fundamentally shifts the landscape.

Because TypePHP operates while your code is actually running inside the Zend Engine, it does not have to guess what an object will do. It has access to real memory via `\WeakMap`.

### 1. Inspection Methods Work Naturally
In TypePHP, you do not have to ban `contains()` or `indexOf()` on covariant classes:

```php
/** @template-covariant T */
class ReadOnlyCollection
{
    /** @param T $item */
    public function contains(mixed $item): bool { ... }
}
```
* `$dogs = new ReadOnlyCollection();`
* `$dogs->contains(new Dog());` runs cleanly and returns a boolean.
* `$dogs->contains(new Piano());` is stopped at runtime with:  
  `TypeError: ReadOnlyCollection::contains(): Argument $item must be Dog, Piano given`.

You get complete type safety, clear documentation, and zero linter warnings.

### 2. Real Mutations Are Blocked at the Exact Moment of Execution
What if someone actually writes a mutation method on a covariant class (`addItem(T $item)`) and attempts to corrupt memory?

```php
/** @param Container<Animal> $container */
function sneakCatIntoDogContainer(Container $container): void
{
    $container->addItem(new Cat()); // Attempting to sneak a Cat into a Dog container!
}

/** @var Container<Dog> $dogContainer */
$dogContainer = new Container();

sneakCatIntoDogContainer($dogContainer);
```

In a static analyzer, this is a dangerous hole, which is why PHPStan bans `addItem()` at the class level.

In TypePHP, the mutation is impossible:
1. Even though the helper function labeled the parameter `Container<Animal>`, TypePHP's `\WeakMap` remembers that this specific instance is locked to `T = Dog`.
2. The exact microsecond `$container->addItem(new Cat())` is invoked, TypePHP halts execution:
   ```text
   TypeError: Container::addItem(): Argument $item (template T = Dog) 
   must be of type Dog, Cat given
   ```
3. The Cat is never added to the internal array. The memory stays clean.

### 3. Pragmatic Return Mode (`strict_return_generic_invariance => false`)
TypePHP includes a configuration setting that aligns generic return boundaries with native PHP's covariant Liskov model:

```php
// typephp.php
return [
    'strict_return_generic_invariance' => false, // Pragmatic Mode
];
```

In pragmatic mode, your existing framework repositories can return specialized generic collections without triggering invariant errors at the return boundary. And because `\WeakMap` guards the instance in memory, any subsequent attempt to push an invalid type into that collection downstream is caught instantly.

---

## Working QA Over Dogmatic Purity

| Capability | Static Analyzers (PHPStan / Psalm / Mago) | Runtime Type Checker (TypePHP) |
| :--- | :--- | :--- |
| **Inspection Methods** (`contains(T)`) | Banned at the class definition. | Fully permitted. Validates the item on call. |
| **Write Methods on Covariant Classes** | Banned at the class definition. | Permitted. Protected in real time by `\WeakMap`. |
| **Return Covariance** | Invariant by default. Rejects child collections. | Configurable to match native PHP covariant returns. |
| **Developer Remedy** | Downgrade to `mixed`, split classes, or add ignore tags. | Write clean, self-documenting code and let runtime guards protect memory. |

Static analyzers are fantastic tools, but they are linters, not religious doctrine. When an analyzer demands that you delete your types or build bloated abstractions just to satisfy an abstract formula, remember Cecil Curry's observation: typing purity is the enemy of working QA.

Use static analysis to catch syntax bugs early, but let TypePHP protect your actual runtime data: keeping your code clean, strict, and grounded in the real world.