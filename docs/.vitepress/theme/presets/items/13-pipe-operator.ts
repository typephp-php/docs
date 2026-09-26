import type { PlaygroundPreset } from '../types';

export default {
  id: 'php85-pipe-operator',
  name: 'PHP 8.5: Pipe Operator (|>) with Callables',
  badge: 'PHP 8.5',
  order: 13,
  code: `<?php

declare(strict_types=1);

/**
 * @param positive-int $x
 * @return positive-int
 */
function doubleNumber(int $x): int {
    return $x * 2;
}

/**
 * @param positive-int $num
 * @return non-empty-string
 */
function formatTag(int $num): string {
    return "#RECORD_{$num}";
}

/**
 * @param non-empty-string $tag
 * @return array{status: 'success', tag: non-empty-string}
 */
function wrapResponse(string $tag): array {
    return ['status' => 'success', 'tag' => $tag];
}

// 1. Pipe through validated stages
$result = 21
    |> doubleNumber(...)
    |> formatTag(...)
    |> wrapResponse(...);

echo "✓ Pipeline Output:\\n";
print_r($result);

// 2. Negative input violates positive-int on the very first stage
echo "Passing -5 into the pipeline...\\n";
$bad = -5
    |> doubleNumber(...)
    |> formatTag(...);
`
} satisfies PlaygroundPreset;