import type { PlaygroundPreset } from '../types';

export default {
  id: 'php85-pipe-operator',
  name: 'PHP 8.5: Pipe Operator (|>) with First-Class Callables',
  badge: 'PHP 8.5',
  order: 1,
  code: `<?php

declare(strict_types=1);

/**
 * Stage 1: Double integer and enforce positive-int
 * @param positive-int $x
 * @return positive-int
 */
function doubleNumber(int $x): int {
    return $x * 2;
}

/**
 * Stage 2: Prefix tag and enforce non-empty-string
 * @param positive-int $num
 * @return non-empty-string
 */
function formatTag(int $num): string {
    return "#RECORD_{$num}";
}

/**
 * Stage 3: Wrap tag into an array shape
 * @param non-empty-string $tag
 * @return array{status: 'success', tag: non-empty-string}
 */
function wrapResponse(string $tag): array {
    return ['status' => 'success', 'tag' => $tag];
}

// Execute through PHP 8.5 native pipe operator (|>)!
// TypePHP intercepts and validates types at every single pipe step.
$result = 21
    |> doubleNumber(...)
    |> formatTag(...)
    |> wrapResponse(...);

print_r($result);

// Try changing 21 to -5 above and click "Run" to see TypePHP catch it!
`
} satisfies PlaygroundPreset;