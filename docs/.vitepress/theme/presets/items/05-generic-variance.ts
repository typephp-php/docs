import type { PlaygroundPreset } from '../types';

export default {
  id: 'generic-variance',
  name: 'Generic Variance: Covariance & Producers',
  badge: 'Variance',
  order: 5,
  code: `<?php

declare(strict_types=1);

abstract class Animal {}
class Dog extends Animal {}
class Cat extends Animal {}
class Car {}

/**
 * @template-covariant T
 */
class Producer {
    public function __construct(public mixed $item) {}

    /**
     * @return T
     */
    public function get(): mixed {
        return $this->item;
    }
}

/**
 * Accepts Producer<Animal> or any subtype producer (Producer<Dog>, Producer<Cat>)
 * @param Producer<Animal> $producer
 */
function inspectProducer(Producer $producer): void {
    echo "✓ Producer holding: " . get_class($producer->get()) . "\\n";
}

// 1. Covariance allows Producer<Dog> and Producer<Cat>
inspectProducer(new Producer(new Dog()));
inspectProducer(new Producer(new Cat()));

// 2. Incompatible type (Car is not an Animal) is strictly rejected
echo "\\nPassing Producer<Car> to Producer<Animal>...\\n";
inspectProducer(new Producer(new Car()));
`
} satisfies PlaygroundPreset;