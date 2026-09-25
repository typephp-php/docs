---
title: "The 'No More DocBlocks' Illusion: Why Native Generics Would Never Kill the Comment Tax in PHP"
description: "Why the dream of native generics eliminating DocBlock comments in PHP is an illusion, the fundamental disconnect between generic classes and untyped arrays, and why the comment tax is here to stay."
date: 2026-09-26
author: Reymart Calicdan
layout: doc
sidebar: false
aside: true
prev: false
next: false
---

# The "No More DocBlocks" Illusion: Why Native Generics Would Never Kill the Comment Tax in PHP

<div class="blog-post-meta" style="margin-bottom: 24px;">
  <span class="blog-badge badge-guide">Deep Dive</span>
  <span>September 26, 2026</span>
  <span class="dot">•</span>
  <span>8 min read</span>
</div>

For over a decade, the PHP community has been chasing one shiny fantasy: **Native Generics**.

Every time the topic comes up, the hope sounds roughly like this:

> "We want native `<T>` generics so we can finally stop writing our types in comments and eliminate the comment tax once and for all."

Yeah. Sure. Because that was totally going to fix everything.

Earlier this year the ecosystem came close with the **"Bound-Erased Generic Types" RFC for PHP 8.6**. The idea was simple enough: add native `<T>` syntax on classes, follow the type-erasure model used elsewhere, and stop living in two parallel type systems.

The RFC didn’t pass. Fine. That’s not really the point.

The deeper problem is this:

**Even if native generics had sailed through with flying colors, you would still be writing DocBlocks on most of your classes, methods, and properties.**

The idea that native generics alone would kill DocBlocks is a beautiful, comforting, complete fucking illusion. Let’s break it down.

## Act I: The "Abstract Box" Fallacy

Language proposals love their clean little examples:

```php
class Box<T>
{
    public function __construct(private T $value) {}

    public function get(): T
    {
        return $this->value;
    }
}
```

Look how neat that is. Look how it solves the entire problem.

Except real applications don’t spend their time wrapping single values in fancy boxes. Generics exist mostly to deal with collections, the messy, plural, array-heavy shit that actually runs software:

- `Collection<User>`
- `Repository<Order>`
- `ResultSet<Product>`
- `Paginator<Invoice>`
- `EventStream<DomainEvent>`

And here’s the part that keeps getting ignored. PHP’s native `array` is still an untyped C-level hash table (`zend_array`). No amount of `<T>` lipstick was ever going to change that.

## Act II: What a Generic Collection Would Actually Look Like

Let’s pretend native generics already exist and look at something closer to reality, like a Laravel-style `Collection`:

```php
class Collection<TKey : array-key, TValue> implements ArrayAccess, Countable, IteratorAggregate
{
    /**
     * Still required, because native PHP arrays cannot be typed as array<TKey, TValue>.
     *
     * @var array<TKey, TValue>
     */
    protected array $items = [];

    /**
     * Come on.. Still required, because all() returns an array, and native PHP cannot type the inner elements.
     *
     * @return array<TKey, TValue>
     */
    public function all(): array
    {
        return $this->items;
    }

    /**
     * Still required, because native PHP has no syntax for typing closure parameters or returns.
     *
     * @template TMapValue
     * @param Closure(TValue, TKey): TMapValue $callback
     * @return static<TKey, TMapValue>
     */
    public function map(Closure $callback): static
    {
        // ...
    }

    /**
     * Still required, because callable predicates cannot declare parameter types natively.
     *
     * @param callable(TValue): bool $predicate
     * @return static<TKey, TValue>
     */
    public function filter(callable $predicate): static
    {
        // ...
    }

    // One of the few methods where native syntax actually works.. Man finally:
    public function put(?TKey $key, TValue $value): static
    {
        $this->items[$key] = $value;
        return $this;
    }
}
```

Do the math. Out of more than a hundred methods in a real collection class, the large majority still deal with arrays, shapes, or transformation closures. Native generics would delete the class-level `@template` lines. They would leave the rest of the fucking tax sitting right there.

We would still be stuck in the same status quo we already live in today as some types written in native syntax, everything else shoved into DocBlocks. Nothing fundamental changes.

## Act III: The Higher-Order Callable Blind Spot

Collection pipelines live and die by closures:

```php
$users->map(fn (User $u) => $u->email);
$orders->filter(fn (Order $o) => $o->isPaid());
$events->pipe($transformer);
```

Native PHP still has zero way to express callable signatures. You cannot write this:

```php
public function map(callable(TValue): TReturn $callback): Collection<TReturn>
```

The language only gives you `callable` or `\Closure`. So even with native generics you would still be forced to write:

```php
/**
 * @template TReturn
 * @param callable(TValue): TReturn $callback
 * @return Collection<TReturn>
 */
public function map(callable $callback): Collection
```

Without native typed arrays and native callable signatures, putting `<T>` on the class is mostly decorative. It’s the programming equivalent of putting a spoiler on a minivan.

## Act IV: Why Type Erasure Is Awkward in PHP

Other languages make erasure work for reasons that don’t fully transfer.

| Language       | How Types Are Handled                          | Runtime Behavior                          |
|----------------|------------------------------------------------|-------------------------------------------|
| **Java**       | `javac` verifies everything ahead of time      | Erased to Object after verification       |
| **TypeScript** | `tsc` verifies everything ahead of time        | Erased to plain JavaScript                |
| **Python**     | All type hints are advisory                    | Nothing is enforced by the interpreter    |
| **PHP**        | No built-in ahead-of-time compiler             | Some native types are enforced at runtime |

Python can treat generics as pure metadata because it has always treated every type hint that way. PHP has spent twenty years training developers to expect that native types are real runtime boundaries. Drop erased generics next to strictly checked scalars and you get this mess:

```php
function process(int $id, Box<int> $box): void {}

// $id is strictly checked. Pass a string and you get a TypeError.
// $box ignores the <int> completely. Pass Box<string> and nothing happens. Fuck bummer.
// Good luck telling newbie php developers that the other parameter doesnt do anything with the type hint.
```

One parameter is a real contract. The next one is a decorative lie. That inconsistency is hard to paper over without an ahead-of-time compiler that PHP simply does not have.

## Act V: What Native Syntax Still Cannot Express

Even a full implementation of generic classes would leave a long list of common type features unsupported by the engine:

| Type Feature                                      | Native Engine Support | DocBlocks + Static Analysis |
|---------------------------------------------------|-----------------------|-----------------------------|
| Generic Classes (`Box<T>`)                        | Feasible              | Supported                   |
| Generic Arrays (`list<T>`, `array<K, V>`)         | Unlikely              | Supported                   |
| Array Shapes (`array{id: int, tags: list<T>}`)    | Unlikely              | Supported                   |
| Scalar Refinements (`positive-int`)               | Unlikely              | Supported                   |
| Closure/Callable Signatures (`callable(TValue): TReturn`)    | Unlikely              | Supported                   |
| Integer Ranges (`int<1, 100>`)                    | Unlikely              | Supported                   |
| Conditional Return Types                          | Unlikely              | Supported                   |
| Reusable Type Aliases                             | Unlikely              | Supported                   |
| By-Ref Out Constraints (`@param-out`)             | Unlikely              | Supported                   |
| State Machine Transitions (`@self-out`)           | Unlikely              | Supported                   |
| Class-string Generics (`class-string<T>`)         | Unlikely              | Supported                   |

Class-string generics are a perfect example. Even with native class generics, you would still need DocBlocks (or an external analyzer) to express things like `class-string<User>` or `class-string<T of Model>`. The engine has no native way to say “this string must be the name of a class that satisfies T.” So the DocBlock stays.

Other languages face the same reality. Java still leans on validation annotations. TypeScript still needs runtime schema libraries. Native generics have never been a complete type system on their own.

## Even If PHP Added Native Generics Today

Let’s be generous. Suppose native generics landed tomorrow with clean syntax, proper variance, and full class support. The comment tax would still not fucking disappear.

You would still need DocBlocks (or some external type system) for:

- Typing the contents of arrays and lists
- Describing array shapes and nested structures
- Annotating closure and callable signatures
- Expressing conditional and refined types
- Documenting by-reference out parameters and state changes
- Importing and reusing complex type aliases
- Class-string constraints (`class-string<T>`, `class-string<T of SomeInterface>`)

Native generics would clean up the class headers. They would not remove the need for a richer type language that can describe the data structures and higher-order functions real applications actually use.

Today we already live in a hybrid mess as some types in native syntax, the rest buried in DocBlocks. Adding native generics would not change that fundamental split. We would still be stuck in the same status quo, just with slightly prettier class declarations. Better than pure DocBlocks, sure. But nowhere near the complete elimination of the comment tax that people keep dreaming about.

## Conclusion

DocBlocks in modern PHP are not temporary scaffolding waiting for a language feature to save them. They currently serve as the expressive layer for shapes, ranges, refinements, generics, class-strings, and higher-order types that native C grammar cannot easily support.

Static analysis tools already give us ahead-of-time verification. Runtime tools can enforce contracts where it matters. Together they form a working type system today.

Native generics would be a real improvement. They would not, by themselves, make DocBlocks unnecessary. The dream of “no more comments” remains a fucking illusion for structural reasons that go deeper than any single language feature.