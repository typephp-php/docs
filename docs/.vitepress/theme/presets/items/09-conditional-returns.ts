import type { PlaygroundPreset } from '../types';

export default {
  id: 'conditional-returns',
  name: 'Conditional Returns ($param is Target ? A : B)',
  badge: 'Conditionals',
  order: 9,
  code: `<?php

declare(strict_types=1);

class Dog {}
class Cat {}

/**
 * Parameter-based conditional return:
 * If $asInt is true, must return positive-int; otherwise non-empty-string.
 * 
 * @param bool $asInt
 * @param mixed $val
 * @return ($asInt is true ? positive-int : non-empty-string)
 */
function formatValue(bool $asInt, mixed $val): mixed {
    return $val;
}

/**
 * Template-based conditional return:
 * If T is Dog, must return positive-int; otherwise non-empty-string.
 * 
 * @template T
 * @param T $pet
 * @param mixed $data
 * @return (T is Dog ? positive-int : non-empty-string)
 */
function evaluatePet(mixed $pet, mixed $data): mixed {
    return $data;
}

// 1. $asInt = true resolves return contract to positive-int
$intRes = formatValue(true, 42);
echo "✓ Integer branch verified: {$intRes}\\n";

// 2. $asInt = false resolves return contract to non-empty-string
$strRes = formatValue(false, 'active_status');
echo "✓ String branch verified: {$strRes}\\n";

// 3. T is Dog resolves return contract to positive-int
$petRes = evaluatePet(new Dog(), 100);
echo "✓ Generic template condition verified: {$petRes}\\n\\n";

// 4. Runtime violation: $asInt is true, but function returns invalid string!
echo "Calling formatValue(true) returning string 'not_an_int'...\\n";
formatValue(true, 'not_an_int');
`
} satisfies PlaygroundPreset;