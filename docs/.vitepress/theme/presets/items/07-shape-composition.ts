import type { PlaygroundPreset } from '../types';

export default {
  id: 'shape-composition',
  name: 'Schema Composition (ShapeA & ShapeB)',
  badge: 'v0.8.0',
  order: 7,
  code: `<?php

declare(strict_types=1);

/**
 * @phpstan-type Identifiable array{id: positive-int, created_at: non-empty-string}
 * @phpstan-type Taggable     array{tags: list<non-empty-string>}
 * @phpstan-type ArticlePayload Identifiable & Taggable
 */
class ArticleService
{
    /**
     * @param ArticlePayload $payload
     */
    public function publish(array $payload): void
    {
        echo "✓ Published Article #{$payload['id']} with " . count($payload['tags']) . " tag(s)\\n";
    }
}

$service = new ArticleService();

// 1. Valid: Merges both schemas seamlessly
$service->publish([
    'id' => 101,
    'created_at' => '2026-09-26',
    'tags' => ['php', 'typephp', 'runtime'],
]);

// 2. Sealed Safety: Extra unexpected keys are strictly rejected
echo "\\nPassing unexpected extra key 'draft'...\\n";
$service->publish([
    'id' => 102,
    'created_at' => '2026-09-26',
    'tags' => ['release'],
    'draft' => true,
]);
`
} satisfies PlaygroundPreset;