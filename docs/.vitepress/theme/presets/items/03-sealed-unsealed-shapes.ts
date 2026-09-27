import type { PlaygroundPreset } from '../types';

export default {
  id: 'sealed-unsealed-shapes',
  name: 'Sealed vs Unsealed Array Shapes',
  badge: 'Shapes',
  order: 3,
  code: `<?php

declare(strict_types=1);

/**
 * Sealed: Extra keys strictly forbidden
 * @param array{id: positive-int, username: non-empty-string} $data
 */
function processSealed(array $data): void {
    echo "✓ Sealed user verified: {$data['username']}\\n";
}

/**
 * Unsealed: Allows additional string metadata
 * @param array{id: positive-int, ...<string, string>} $data
 */
function processUnsealed(array $data): void {
    echo "✓ Unsealed verified with " . count($data) . " item(s)\\n";
}

// 1. Valid calls
processSealed(['id' => 1, 'username' => 'Alice']);
processUnsealed(['id' => 1, 'role' => 'admin', 'dept' => 'engineering']);

// 2. Extra key triggers TypeError on sealed shape
echo "\\nPassing unexpected key 'draft' to sealed shape...\\n";
processSealed([
    'id' => 1,
    'username' => 'Alice',
    'draft' => true,
]);
`
} satisfies PlaygroundPreset;