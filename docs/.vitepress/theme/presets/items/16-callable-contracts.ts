import type { PlaygroundPreset } from '../types';

export default {
  id: 'callable-contracts',
  name: 'Callables & Closures (Input & Return Contracts)',
  badge: 'Callables',
  order: 9,
  code: `<?php

declare(strict_types=1);

/**
 * TypePHP wraps $formatter in a proxy closure that validates
 * both incoming arguments and outgoing return values upon invocation.
 *
 * @param callable(positive-int $id, non-empty-string $tag): non-empty-string $formatter
 */
function formatUserRecord(int $id, string $tag, callable $formatter): string {
    return $formatter($id, $tag);
}

/**
 * Enforce strict \\Closure instance and validate return shape
 *
 * @param Closure(positive-int): array{id: positive-int, status: 'active'} $factory
 */
function createUserPayload(int $id, Closure $factory): array {
    return $factory($id);
}

// 1. Valid callback execution
$result = formatUserRecord(42, 'ADMIN', fn (int $id, string $tag): string => "[{$tag}] #{$id}");
echo "✓ Callback result: {$result}\\n";

// 2. Valid closure returning array shape
$payload = createUserPayload(100, fn (int $id): array => ['id' => $id, 'status' => 'active']);
echo "✓ Factory created payload with id: {$payload['id']}\\n\\n";

// 3. Runtime violation: callback returns empty string violating non-empty-string
echo "Executing callback returning empty string...\\n";
formatUserRecord(42, 'ADMIN', fn (int $id, string $tag): string => '');
`
} satisfies PlaygroundPreset;