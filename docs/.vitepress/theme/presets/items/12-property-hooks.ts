import type { PlaygroundPreset } from '../types';

export default {
  id: 'property-hooks',
  name: 'PHP 8.4: Property Hooks Validation',
  badge: 'PHP 8.4',
  order: 12,
  code: `<?php

declare(strict_types=1);

class UserProfile {
    /**
     * @var positive-int
     */
    public int $score = 10 {
        get => $this->_score;
        set => $this->_score = $value;
    }

    private int $_score = 10;

    /**
     * @var non-empty-string
     */
    public string $username {
        get => $this->_username;
        set => $this->_username = trim($value);
    }

    private string $_username = 'Alice';
}

$profile = new UserProfile();
$profile->score = 100;
$profile->username = '  Bob  ';

echo "✓ Profile initialized: User={$profile->username}, Score={$profile->score}\\n\\n";

// Setting negative score violates positive-int
echo "Assigning invalid negative score -50...\\n";
$profile->score = -50;
`
} satisfies PlaygroundPreset;