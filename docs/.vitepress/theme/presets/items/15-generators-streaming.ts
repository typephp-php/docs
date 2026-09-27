import type { PlaygroundPreset } from '../types';

export default {
  id: 'generators-streaming',
  name: 'Generators: Lazy Streams & TSend Validation',
  badge: 'Generators',
  order: 15,
  code: `<?php

declare(strict_types=1);

/**
 * Lazy stream yielding non-empty-string keys and positive-int values
 *
 * @return Generator<non-empty-string, positive-int>
 */
function counterStream(): Generator {
    yield 'batch_a' => 10;
    yield 'batch_b' => 20;
    yield 'batch_c' => -5; // Violates positive-int value!
}

/**
 * Interactive bidirectional generator with TSend validation
 *
 * @return Generator<int, string, positive-int, void>
 */
function interactiveQuota(): Generator {
    $quota = yield 1 => 'Awaiting quota allocation:';
    echo "✓ Received valid quota allocation: +{$quota}\\n";
}

// 1. Lazy evaluation: items 1 and 2 yield cleanly without upfront array conversion
$stream = counterStream();
echo "✓ Yielded: {$stream->key()} => {$stream->current()}\\n";
$stream->next();
echo "✓ Yielded: {$stream->key()} => {$stream->current()}\\n\\n";

// 2. Interactive generator validates values sent via $gen->send()
$quotaGen = interactiveQuota();
$quotaGen->current();
$quotaGen->send(500); // 500 satisfies positive-int TSend!

// 3. Advancing counterStream to batch_c triggers lazy TypeError on -5
echo "\\nAdvancing stream to invalid negative yield...\\n";
$stream->next();
`
} satisfies PlaygroundPreset;