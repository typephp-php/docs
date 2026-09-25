import type { PlaygroundPreset } from '../types';

export default {
  id: 'discriminator-unions',
  name: 'Discriminator-Aware Tagged Unions',
  badge: 'Unions',
  order: 5,
  code: `<?php

declare(strict_types=1);

/**
 * Tagged union of event payloads
 *
 * @param array{type: 'click', x: int, y: int}
 *      | array{type: 'hover', element: non-empty-string}
 *      | array{type: 'scroll', offset: positive-int} $event
 */
function handleEvent(array $event): void {
    echo "Successfully handled event: {$event['type']}\\n";
}

// Valid calls
handleEvent(['type' => 'click', 'x' => 10, 'y' => 20]);
handleEvent(['type' => 'scroll', 'offset' => 150]);

// When a discriminator matches ('hover'), TypePHP isolates the exact branch
// and pinpoints the failing field ('element') rather than blaming 'click'!
echo "\\nPassing hover event with invalid empty element...\\n";
handleEvent([
    'type' => 'hover',
    'element' => '', // Fails non-empty-string!
]);
`
} satisfies PlaygroundPreset;