import type { PlaygroundPreset } from '../types';

export default {
  id: 'database-shapes-sqlite',
  name: 'Database Records & SQLite (PDO)',
  badge: 'Database',
  order: 18,
  code: `<?php

declare(strict_types=1);

/**
 * Service expecting sanitized, strongly typed database records
 *
 * @param array{id: positive-int, username: non-empty-string, role: 'admin'|'user'} $row
 */
function processUserRecord(array $row): void
{
    echo "✓ Valid DB Record: #{$row['id']} - {$row['username']} ({$row['role']})\\n";
}

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$pdo->exec("CREATE TABLE users (id INTEGER, username TEXT, role TEXT)");

// Insert records (Row 1 is valid; Row 2 has corrupt legacy/webhook data)
$pdo->exec("INSERT INTO users VALUES (1, 'Alice', 'admin')");
$pdo->exec("INSERT INTO users VALUES (-10, '', 'superadmin')");

echo "=== Reading Row 1 from SQLite ===\\n";
$stmt = $pdo->query("SELECT id, username, role FROM users WHERE id = 1");
$row1 = $stmt->fetch(PDO::FETCH_ASSOC);

// Passes: Row 1 matches declared array shape
processUserRecord($row1);

echo "\\n=== Reading Row 2 from SQLite (Corrupted Data) ===\\n";
$stmt = $pdo->query("SELECT id, username, role FROM users WHERE id = -10");
$row2 = $stmt->fetch(PDO::FETCH_ASSOC);

// TypePHP catches the corrupt database row at runtime before it leaks into business logic!
processUserRecord($row2);
`
} satisfies PlaygroundPreset;