import type { PlaygroundPreset } from '../types';

export default {
  id: 'magic-annotations',
  name: 'Magic Annotations (@property & @method)',
  badge: 'Magic',
  order: 17,
  config: {
    magicPropertyReads: true,
  },
  code: `<?php

declare(strict_types=1);

/**
 * @method string findByName(string $name)
 * @method int count()
 * @property-read string $status
 * @property-write string $name
 */
class DynamicModel
{
    private array $data = [];

    public function __call(string $name, array $args): mixed
    {
        if ($name === 'findByName') {
            return "Found: " . $args[0];
        }
        if ($name === 'count') {
            return count($this->data);
        }
        throw new \\BadMethodCallException("Method {$name} not found");
    }

    public function __get(string $name): mixed
    {
        return $this->data[$name] ?? null;
    }

    public function __set(string $name, mixed $value): void
    {
        $this->data[$name] = $value;
    }
}

$model = new DynamicModel();

// 1. Valid dynamic @method calls
echo "✓ " . $model->findByName('Alice') . "\\n";
echo "✓ Count: " . $model->count() . "\\n\\n";

// 2. Valid dynamic property read and write
$model->name = 'Bob';
$model->data['status'] = 'active';
echo "✓ Read status: " . $model->status . "\\n\\n";

// 3. Invalid @property-write: passing integer violates string
echo "Writing invalid integer to @property-write string 'name'...\\n";
try {
    $model->name = 12345;
} catch (\\TypePHP\\Exception\\TypeError $e) {
    echo "✓ Caught expected write error:\\n   " . $e->getMessage() . "\\n\\n";
}

// 4. Invalid @method call: passing integer violates string argument
echo "Invoking @method with invalid integer argument...\\n";
try {
    $model->findByName(999);
} catch (\\TypePHP\\Exception\\TypeError $e) {
    echo "✓ Caught expected method error:\\n   " . $e->getMessage() . "\\n\\n";
}

/*
 |--------------------------------------------------------------------------
 | 5. Dynamic Property Read Validation (__get)
 |--------------------------------------------------------------------------
 | This preset runs with "Validate Dynamic Property Reads (__get)" turned ON
 | in the [Config] popover above.
 |
 | Reading an unpopulated property returns null, which violates non-nullable
 | '@property-read string $status' and halts with a TypeError below!
 |
 | INTERACTIVE EXPERIMENT:
 | Open the [Config] popover in the top toolbar, toggle OFF
 | "Validate Dynamic Property Reads (__get)", and click Run again!
 | You will see it allow the null return (pragmatic mode for unhydrated ORMs).
 */
echo "Reading unpopulated @property-read (returns null)...\\n";
unset($model->data['status']);
$val = $model->status;
`
} satisfies PlaygroundPreset;