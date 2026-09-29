import type { PlaygroundPreset } from '../types';

export default {
  id: 'inline-variables',
  name: 'Inline Variables (@var) & Compound Operations',
  badge: 'Variables',
  order: 19,
  code: `<?php

declare(strict_types=1);

/** @var positive-int $score */
$score = 10;
$score += 5; // Valid compound addition ($score = 15)
echo "✓ Score after addition: {$score}\\n";

/** @var int<1, 10> $multiplier */
$multiplier = 5;

// Block-scope shadowing: inner scope inherits then restores outer contracts
if (true) {
    /** @var non-empty-string $tag */
    $tag = 'VIP_CUSTOMER';
    echo "✓ Block-scoped tag: {$tag}\\n";
}

// Multi-variable destructuring assignment
/**
 * @var positive-int $id
 * @var non-empty-string $username
 */
[$id, $username] = [42, 'Alice'];
echo "✓ Destructured user #{$id}: {$username}\\n\\n";

// Compound assignment violation:
// Tip: Click [Transformed Source] above to see AST check injection,
// or open [Config] and toggle OFF 'Scalars' to watch it bypass!
echo "Multiplying score by -2 (violates positive-int)...\\n";
$score *= -2;
`
} satisfies PlaygroundPreset;