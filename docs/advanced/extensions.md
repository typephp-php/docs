# Building Extensions

TypePHP provides an Extension System that allows third-party package authors and framework integrations to automatically register path whitelists and pre-verified stub files so end-users can benefit from type checking without writing manual include paths or stub configuration in `typephp.php`.

---

## Implementing `ExtensionInterface`

To create an extension, implement `TypePHP\Extension\ExtensionInterface` and return your package's whitelist include paths and bundled stub files:

```php
<?php

declare(strict_types=1);

namespace Acme\SamplePackage;

use TypePHP\Extension\ExtensionInterface;

class TypePHPExtension implements ExtensionInterface
{
    /**
     * Returns configuration overrides provided by this extension.
     *
     * @return array<string, mixed>
     */
    public function getConfig(): array
    {
        return [
            // 1. Whitelist package source files
            'include' => [
                'vendor/acme/sample-package/src/**',
            ],

            // 2. Register bundled stub files for this package
            'stubs' => [
                __DIR__ . '/../stubs/SamplePackage.stub.php',
            ],
        ];
    }
}
```

---

## Structural Safety ("Include & Stubs Only" Safeguard)

To protect end-user application stability and prevent third-party package conflicts, TypePHP enforces **Include & Stubs Only Authority** on extension configurations:

1. **Path Whitelisting:** Extensions can ONLY append paths to the global `include` array.
2. **Stub Registration:** Extensions can ONLY append stub paths to the global `stubs` array.
3. **Exclusion Protection:** Extensions are structurally forbidden from adding `exclude` rules. A third-party extension can never blacklist your application's `src/` directory or another package.
4. **Feature Flag Immunity:** Extensions cannot modify global feature flags (`enabled`, `cache`, `array_validation`, `inline_vars`). The end-user's `typephp.php` holds ultimate authority.

---

## Registering Extensions in `typephp.php`

End-users explicitly register extension classes in their `typephp.php` configuration file:

```php
// typephp.php
return [
    /*
    |--------------------------------------------------------------------------
    | Registered Extensions
    |--------------------------------------------------------------------------
    | Explicitly list third-party extension classes.
    */
    'extensions' => [
        \Acme\SamplePackage\TypePHPExtension::class,
    ],

    'include' => [
        'src/**',
        'app/**',
        'tests/**',
    ],

    'exclude' => [
        'vendor/**',
        'storage/**',
    ],
];
```

---

## Real-World Example: Third-Party Covariant Collections

A third-party package extension can ship with pre-written stubs to make generic collections covariant automatically:

```php
namespace App\Extensions;

use TypePHP\Extension\ExtensionInterface;

class RamseyCollectionExtension implements ExtensionInterface
{
    public function getConfig(): array
    {
        return [
            'include' => [
                'vendor/ramsey/collection/src/**',
            ],
            'stubs' => [
                __DIR__ . '/../../stubs/ramsey-collection.stub.php',
            ],
        ];
    }
}
```