import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const searchPaths = [
  process.env.TYPEPHP_PATH,
  path.resolve(rootDir, '../typephp'),
  path.resolve(rootDir, '../../typephp'),
  path.resolve(rootDir, 'typephp'),
].filter(Boolean);

let typephpRepoPath = null;
for (const candidate of searchPaths) {
  if (fs.existsSync(path.join(candidate, 'src/TypePHP.php'))) {
    typephpRepoPath = candidate;
    break;
  }
}

if (!typephpRepoPath) {
  console.error('\x1b[31m[Bundle Error]\x1b[0m Could not locate the TypePHP core repository.');
  console.error('Searched in:', searchPaths);
  console.error('Please ensure the "typephp" repository is placed next to "typephp-docs" (e.g. ../typephp)');
  console.error('Or set the TYPEPHP_PATH environment variable: TYPEPHP_PATH=C:/path/to/typephp');
  process.exit(1);
}

console.log(`\x1b[36m[TypePHP Bundler]\x1b[0m Found TypePHP core at: ${typephpRepoPath}`);

const outputDir = path.join(rootDir, 'docs/public/wasm');
fs.mkdirSync(outputDir, { recursive: true });
const outputFile = path.join(outputDir, 'typephp-runtime.json');

const vfs = {};

function addFilesRecursively(srcDir, vfsPrefix) {
  if (!fs.existsSync(srcDir)) {
    console.warn(`\x1b[33m[Warning]\x1b[0m Directory not found: ${srcDir}`);
    return;
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      addFilesRecursively(fullPath, `${vfsPrefix}/${entry.name}`);
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      const vfsPath = `${vfsPrefix}/${entry.name}`;
      const content = fs.readFileSync(fullPath, 'utf8');
      vfs[vfsPath] = content;
    }
  }
}

console.log('Packaging TypePHP src/...');
addFilesRecursively(path.join(typephpRepoPath, 'src'), '/typephp/src');

console.log('Packaging nikic/php-parser...');
addFilesRecursively(
  path.join(typephpRepoPath, 'vendor/nikic/php-parser/lib/PhpParser'),
  '/typephp/vendor/nikic/php-parser/lib/PhpParser'
);

console.log('Packaging phpstan/phpdoc-parser...');
addFilesRecursively(
  path.join(typephpRepoPath, 'vendor/phpstan/phpdoc-parser/src'),
  '/typephp/vendor/phpstan/phpdoc-parser/src'
);

console.log('Generating VFS autoloader...');
vfs['/typephp/vendor/autoload.php'] = `<?php
declare(strict_types=1);

spl_autoload_register(function (string $class): bool {
    $prefixes = [
        'TypePHP\\\\' => '/typephp/src/',
        'PhpParser\\\\' => '/typephp/vendor/nikic/php-parser/lib/PhpParser/',
        'PHPStan\\\\PhpDocParser\\\\' => '/typephp/vendor/phpstan/phpdoc-parser/src/',
    ];

    foreach ($prefixes as $prefix => $baseDir) {
        $len = strlen($prefix);
        if (strncmp($prefix, $class, $len) === 0) {
            $relativeClass = substr($class, $len);
            $file = $baseDir . str_replace('\\\\', '/', $relativeClass) . '.php';
            if (file_exists($file)) {
                require_once $file;
                return true;
            }
        }
    }
    return false;
});
`;

const fileCount = Object.keys(vfs).length;
if (fileCount < 50) {
  console.error(`\x1b[31m[Error]\x1b[0m Only ${fileCount} files collected. Did you run "composer install" in the TypePHP core repository?`);
  process.exit(1);
}

fs.writeFileSync(outputFile, JSON.stringify(vfs));
const sizeMb = (fs.statSync(outputFile).size / (1024 * 1024)).toFixed(2);

console.log(`\x1b[32m✓ Runtime bundle created successfully!\x1b[0m`);
console.log(`  • Destination: docs/public/wasm/typephp-runtime.json`);
console.log(`  • Files bundled: ${fileCount}`);
console.log(`  • Uncompressed size: ${sizeMb} MB`);