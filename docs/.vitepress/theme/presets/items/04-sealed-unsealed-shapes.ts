import type { PlaygroundPreset } from '../types';

export default {
  id: 'sealed-unsealed-shapes',
  name: 'Sealed vs Unsealed Array Shapes',
  badge: 'Shapes',
  order: 4,
  code: `<?php

declare(strict_types=1);

/**
 * 1. Sealed Shape: Strictly forbids unexpected extra keys
 * @param array{id: positive-int, username: non-empty-string} $data
 */
function processSealed(array $data): void {
    echo "Sealed check passed for user: {$data['username']}\\n";
}

/**
 * 2. Unsealed Typed Shape: Requires 'id', but allows extra string pairs
 * @param array{id: positive-int, ...<string, string>} $data
 */
function processUnsealed(array $data): void {
    echo "Unsealed check passed with " . count($data) . " items!\\n";
}

// 1. Valid sealed call
processSealed(['id' => 1, 'username' => 'Alice']);

// 2. Valid unsealed call with extra string metadata
processUnsealed(['id' => 1, 'role' => 'admin', 'department' => 'engineering']);

// 3. Passing extra key to sealed shape throws TypeError!
echo "\\nPassing unexpected key 'extra' to sealed shape...\\n";
processSealed([
    'id' => 1,
    'username' => 'Alice',
    'extra_unregistered_key' => true,
]);
`
} satisfies PlaygroundPreset;