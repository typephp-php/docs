import type { PlaygroundPreset } from '../types';

export default {
  id: 'property-hooks',
  name: 'PHP 8.4: Property Hooks Validation',
  badge: 'PHP 8.4',
  order: 3,
  code: `<?php

declare(strict_types=1);

class UserProfile {
    /**
     * Property Hook with @var positive-int contract
     * @var positive-int
     */
    public int $score = 10 {
        get => $this->_score;
        set => $this->_score = $value;
    }

    private int $_score = 10;

    /**
     * Hook with @var non-empty-string contract
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

echo "Profile: User={$profile->username}, Score={$profile->score}\\n\\n";

// Violating positive-int on the set hook throws TypeError immediately!
echo "Assigning invalid negative score -50...\\n";
$profile->score = -50;
`
} satisfies PlaygroundPreset;