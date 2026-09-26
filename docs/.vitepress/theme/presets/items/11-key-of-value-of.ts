import type { PlaygroundPreset } from '../types';

export default {
  id: 'key-of-value-of',
  name: 'key-of and value-of Extractions',
  badge: 'Types',
  order: 11,
  code: `<?php

declare(strict_types=1);

enum TransactionStatus: string {
    case PENDING = 'pending';
    case COMPLETED = 'completed';
    case FAILED = 'failed';
}

class DatabaseMap {
    public const DRIVERS = [
        'mysql' => 'PDO\\\\MySQL\\\\Driver',
        'pgsql' => 'PDO\\\\PgSQL\\\\Driver',
    ];
}

/**
 * @param key-of<TransactionStatus> $statusName
 * @param value-of<TransactionStatus> $statusValue
 * @param key-of<DatabaseMap::DRIVERS> $driverKey
 */
function configurePayment(string $statusName, string $statusValue, string $driverKey): void {
    echo "✓ Configured: Status={$statusName} ({$statusValue}), Driver={$driverKey}\\n";
}

// 1. Valid call
configurePayment('COMPLETED', 'completed', 'mysql');

// 2. Passing invalid driver key triggers TypeError
echo "\\nPassing invalid driver key 'sqlite'...\\n";
configurePayment('COMPLETED', 'completed', 'sqlite');
`
} satisfies PlaygroundPreset;