import type { PlaygroundPreset } from '../types';

export default {
  id: 'class-string-generics',
  name: 'class-string<T> Factories & Dynamic DI',
  badge: 'Generics',
  order: 6,
  code: `<?php

declare(strict_types=1);

interface RepositoryInterface {
    public function getTable(): string;
}

class UserRepository implements RepositoryInterface {
    public function getTable(): string { return 'users'; }
}

class OrderRepository implements RepositoryInterface {
    public function getTable(): string { return 'orders'; }
}

class UnrelatedService {}

/**
 * @template T of RepositoryInterface
 * @param class-string<T> $class
 * @return T
 */
function resolveRepository(string $class): RepositoryInterface {
    return new $class();
}

// 1. Infers return type T = UserRepository
$userRepo = resolveRepository(UserRepository::class);
echo "✓ Resolved: " . get_class($userRepo) . " (table: {$userRepo->getTable()})\\n";

// 2. Infers return type T = OrderRepository
$orderRepo = resolveRepository(OrderRepository::class);
echo "✓ Resolved: " . get_class($orderRepo) . " (table: {$orderRepo->getTable()})\\n\\n";

// 3. Class violating RepositoryInterface fails bound check
echo "Attempting to resolve class that violates RepositoryInterface bound...\\n";
resolveRepository(UnrelatedService::class);
`
} satisfies PlaygroundPreset;