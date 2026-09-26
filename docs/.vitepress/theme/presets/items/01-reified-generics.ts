import type { PlaygroundPreset } from '../types';

export default {
  id: 'reified-generics',
  name: 'Runtime Reified Generics',
  badge: 'Generics',
  order: 1,
  code: `<?php

declare(strict_types=1);

use TypePHP\\TypePHP;

class User {
    public function __construct(public string $name) {}
}

class Product {
    public function __construct(public string $sku) {}
}

/**
 * @template T
 */
class Collection {
    /** @var array<int, T> */
    public array $items = [];

    /**
     * @param T $item
     */
    public function add(mixed $item): void {
        $this->items[] = $item;
    }
}

/** @var Collection<User> $users */
$users = new Collection();

// 1. Valid addition
$users->add(new User('Alice'));
echo "✓ Added User: {$users->items[0]->name}\\n";
echo "✓ Reified Memory Type: " . TypePHP::getGenericType($users) . "\\n\\n";

// 2. Runtime violation: Product violates Collection<User>
echo "Attempting to add Product into Collection<User>...\\n";
$users->add(new Product('SKU-100'));
`
} satisfies PlaygroundPreset;