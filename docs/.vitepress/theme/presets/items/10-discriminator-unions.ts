import type { PlaygroundPreset } from '../types';

export default {
  id: 'discriminator-unions',
  name: 'Discriminator-Aware Tagged Unions',
  badge: 'Unions',
  order: 10,
  code: `<?php

declare(strict_types=1);

/**
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void {
    echo "✓ Handled event: {$event['type']}\\n";
}

// 1. Valid calls
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'scroll', 'offset' => 150]);

// 2. TypePHP pinpoints the exact failing field ('element') on the matched branch
echo "\\nPassing hover event with empty element string...\\n";
handleEvent([
    'type' => 'hover',
    'element' => '',
]);
`
} satisfies PlaygroundPreset;