import type { PlaygroundPreset } from '../types';

export default {
  id: 'reified-generics',
  name: 'Runtime Reified Generics (\\WeakMap State)',
  badge: 'Generics',
  order: 2,
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
 * Generic container class
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

// 1. Prebind template T = User to this specific instance in memory
/** @var Collection<User> $users */
$users = new Collection();

// 2. Adding a User succeeds
$users->add(new User('Alice'));
echo "Successfully added User: {$users->items[0]->name}\\n";

// 3. Inspect reified generic type in live memory via TypePHP API!
echo "Reified Generic Type: " . TypePHP::getGenericType($users) . "\\n\\n";

// 4. Adding a Product throws TypeError at runtime!
echo "Attempting to add a Product into Collection<User>...\\n";
$users->add(new Product('SKU-100'));
`
} satisfies PlaygroundPreset;