import type { PlaygroundPreset } from '../types';

export default {
  id: 'conditional-parameters',
  name: 'Conditional Parameters ($param is Target ? A : B)',
  badge: 'Conditionals',
  order: 8,
  code: `<?php

declare(strict_types=1);

/**
 * Expected type of $payload strictly depends on $format
 * 
 * @param 'json'|'xml' $format
 * @param ($format is 'json' ? array<string, mixed> : non-empty-string) $payload
 */
function dispatchWebhook(string $format, mixed $payload): void
{
    if (is_array($payload)) {
        echo "✓ Dispatched JSON payload with " . count($payload) . " field(s)\\n";
    } else {
        echo "✓ Dispatched XML string of length " . strlen($payload) . "\\n";
    }
}

// 1. When format is 'json', payload MUST be an array
dispatchWebhook('json', ['status' => 'success', 'code' => 200]);

// 2. When format is 'xml', payload MUST be a string
dispatchWebhook('xml', '<response><status>ok</status></response>');

// 3. Passing a string when format is 'json' throws TypeError
echo "\\nPassing string payload when format is 'json'...\\n";
dispatchWebhook('json', '{"status":"ok"}');
`
} satisfies PlaygroundPreset;