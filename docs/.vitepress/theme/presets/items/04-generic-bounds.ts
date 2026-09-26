import type { PlaygroundPreset } from '../types';

export default {
  id: 'generic-bounds',
  name: 'Generic Upper Bounds (@template T of UpperBound)',
  badge: 'Generics',
  order: 4,
  code: `<?php

declare(strict_types=1);

abstract class Animal {
    public function __construct(public string $name) {}
}

class Dog extends Animal {}
class Cat extends Animal {}
class Car {}

/**
 * @template T of Animal
 */
class Shelter {
    /** @var array<int, T> */
    public array $animals = [];

    /**
     * @param T $animal
     */
    public function admit(Animal $animal): void {
        $this->animals[] = $animal;
        echo "✓ Admitted {$animal->name} (" . get_class($animal) . ")\\n";
    }
}

// 1. Valid: Dog satisfies upper bound Animal
/** @var Shelter<Dog> $dogShelter */
$dogShelter = new Shelter();
$dogShelter->admit(new Dog('Buddy'));

// 2. Valid: Cat satisfies upper bound Animal
/** @var Shelter<Cat> $catShelter */
$catShelter = new Shelter();
$catShelter->admit(new Cat('Luna'));

// 3. Invalid: Car violates upper bound Animal at assignment!
echo "\\nAttempting to create Shelter<Car>...\\n";
/** @var Shelter<Car> $carShelter */
$carShelter = new Shelter();
`
} satisfies PlaygroundPreset;