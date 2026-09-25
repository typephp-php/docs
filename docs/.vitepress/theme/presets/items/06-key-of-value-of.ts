import type { PlaygroundPreset } from '../types';

export default {
  id: 'key-of-value-of',
  name: 'key-of and value-of Extractions',
  badge: 'Types',
  order: 6,
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
 * @param key-of<TransactionStatus> $statusName     Requires enum case name
 * @param value-of<TransactionStatus> $statusValue Requires enum backing value
 * @param key-of<DatabaseMap::DRIVERS> $driverKey  Requires constant array key
 */
function configurePayment(string $statusName, string $statusValue, string $driverKey): void {
    echo "Valid config: Status={$statusName} ({$statusValue}), Driver={$driverKey}\\n";
}

// Valid call
configurePayment('COMPLETED', 'completed', 'mysql');

// Passing invalid driver key triggers TypeError!
echo "\\nPassing invalid driver key 'sqlite'...\\n";
configurePayment('COMPLETED', 'completed', 'sqlite');
`
} satisfies PlaygroundPreset;