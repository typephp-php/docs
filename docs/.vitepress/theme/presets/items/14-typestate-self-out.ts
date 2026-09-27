import type { PlaygroundPreset } from '../types';

export default {
  id: 'typestate-self-out',
  name: 'State Machines with Typestates (@self-out)',
  badge: 'Typestates',
  order: 14,
  code: `<?php

declare(strict_types=1);

use TypePHP\\TypePHP;

/**
 * @template TState of 'unauthenticated'|'authenticated'
 */
class Session {
    /**
     * @self-out self<'authenticated'>
     */
    public function login(): void {}

    /**
     * @self-out self<'unauthenticated'>
     */
    public function logout(): void {}
}

/**
 * @param Session<'authenticated'> $session
 */
function viewSecretDashboard(Session $session): void {
    echo "✓ Access GRANTED to secret dashboard!\\n";
}

/** @var Session<'unauthenticated'> $session */
$session = new Session();
echo "Initial State: " . TypePHP::getGenericType($session) . "\\n";

// 1. Transition state
$session->login();
echo "State after login(): " . TypePHP::getGenericType($session) . "\\n";

// 2. Now permitted
viewSecretDashboard($session);

// 3. Logout transitions state back
$session->logout();
echo "State after logout(): " . TypePHP::getGenericType($session) . "\\n";

echo "\\nAttempting to access dashboard with logged-out session...\\n";
viewSecretDashboard($session);
`
} satisfies PlaygroundPreset;