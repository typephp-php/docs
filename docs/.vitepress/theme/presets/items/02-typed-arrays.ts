import type { PlaygroundPreset } from '../types';

export default {
  id: 'typed-arrays',
  name: 'Typed Arrays, Lists & Refinements',
  badge: 'Arrays',
  order: 2,
  code: `<?php

declare(strict_types=1);

/**
 * @param list<positive-int> $scores
 * @param non-empty-list<string> $tags
 */
function processMetrics(array $scores, array $tags): void {
    echo "✓ Verified list of " . count($scores) . " score(s)\\n";
    echo "✓ Tags: " . implode(', ', $tags) . "\\n\\n";
}

/**
 * @param array<string, int<1, 100>> $thresholds
 */
function configureThresholds(array $thresholds): void {
    echo "✓ Configured " . count($thresholds) . " threshold rule(s)\\n\\n";
}

// 1. Valid list and non-empty-list
processMetrics([10, 20, 30], ['php', 'typephp']);

// 2. Valid associative map with int-range bounds (1-100)
configureThresholds([
    'cpu_alert' => 85,
    'disk_alert' => 90,
]);

// 3. Passing associative keys where list is expected throws TypeError
echo "Passing associative keys where list is expected...\\n";
processMetrics(['score_1' => 10], ['php']);
`
} satisfies PlaygroundPreset;