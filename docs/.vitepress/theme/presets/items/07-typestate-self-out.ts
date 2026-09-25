import type { PlaygroundPreset } from '../types';

export default {
  id: 'typestate-self-out',
  name: 'State Machines with Typestates (@self-out)',
  badge: 'Typestates',
  order: 7,
  code: `<?php

declare(strict_types=1);

use TypePHP\\TypePHP;

/**
 * Finite State Machine tracking authentication state
 * @template TState of 'unauthenticated'|'authenticated'
 */
class Session {
    /**
     * Mutates generic state to 'authenticated' in memory!
     * @self-out self<'authenticated'>
     */
    public function login(): void {}

    /**
     * Mutates generic state back to 'unauthenticated'
     * @self-out self<'unauthenticated'>
     */
    public function logout(): void {}
}

/**
 * Function strictly requiring an authenticated session
 * @param Session<'authenticated'> $session
 */
function viewSecretDashboard(Session $session): void {
    echo "Access GRANTED to secret dashboard!\\n";
}

/** @var Session<'unauthenticated'> $session */
$session = new Session();
echo "Initial State: " . TypePHP::getGenericType($session) . "\\n";

// 1. Transition state
$session->login();
echo "State after login(): " . TypePHP::getGenericType($session) . "\\n";

// 2. Now allowed!
viewSecretDashboard($session);

// 3. Logout transitions state back
$session->logout();
echo "State after logout(): " . TypePHP::getGenericType($session) . "\\n";

echo "\\nAttempting to access dashboard with logged-out session...\\n";
viewSecretDashboard($session);
`
} satisfies PlaygroundPreset;