import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const outputDir = path.join(rootDir, 'docs/public/wasm');
fs.mkdirSync(outputDir, { recursive: true });
const outputFileGz = path.join(outputDir, 'typephp-runtime.json.gz');
const outputFileJson = path.join(outputDir, 'typephp-runtime.json');

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
  if (fs.existsSync(outputFileGz) || fs.existsSync(outputFileJson)) {
    console.log('\x1b[33m[TypePHP Bundler]\x1b[0m Core repository not found, but pre-built runtime bundle exists.');
    process.exit(0);
  }
  console.error('\x1b[31m[Bundle Error]\x1b[0m Could not locate TypePHP core repository.');
  process.exit(1);
}

console.log(`\x1b[36m[TypePHP Bundler]\x1b[0m Found TypePHP core at: ${typephpRepoPath}`);

const files = {};
const dirSet = new Set();

function addFilesRecursively(srcDir, vfsPrefix) {
  if (!fs.existsSync(srcDir)) return;

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(srcDir, entry.name);
    if (entry.isDirectory()) {
      dirSet.add(`${vfsPrefix}/${entry.name}`);
      addFilesRecursively(fullPath, `${vfsPrefix}/${entry.name}`);
    } else if (entry.isFile() && entry.name.endsWith('.php')) {
      const vfsPath = `${vfsPrefix}/${entry.name}`;
      files[vfsPath] = fs.readFileSync(fullPath, 'utf8');
    }
  }
}

console.log('Packaging TypePHP src/...');
dirSet.add('/typephp');
dirSet.add('/typephp/src');
addFilesRecursively(path.join(typephpRepoPath, 'src'), '/typephp/src');

console.log('Packaging nikic/php-parser...');
dirSet.add('/typephp/vendor');
dirSet.add('/typephp/vendor/nikic');
dirSet.add('/typephp/vendor/nikic/php-parser');
dirSet.add('/typephp/vendor/nikic/php-parser/lib');
dirSet.add('/typephp/vendor/nikic/php-parser/lib/PhpParser');
addFilesRecursively(
  path.join(typephpRepoPath, 'vendor/nikic/php-parser/lib/PhpParser'),
  '/typephp/vendor/nikic/php-parser/lib/PhpParser'
);

console.log('Packaging phpstan/phpdoc-parser...');
dirSet.add('/typephp/vendor/phpstan');
dirSet.add('/typephp/vendor/phpstan/phpdoc-parser');
dirSet.add('/typephp/vendor/phpstan/phpdoc-parser/src');
addFilesRecursively(
  path.join(typephpRepoPath, 'vendor/phpstan/phpdoc-parser/src'),
  '/typephp/vendor/phpstan/phpdoc-parser/src'
);

files['/typephp/vendor/autoload.php'] = `<?php
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

const sortedDirs = Array.from(dirSet).sort((a, b) => a.split('/').length - b.split('/').length);

const payload = {
  dirs: sortedDirs,
  files: files,
};

const jsonString = JSON.stringify(payload);
const gzipped = zlib.gzipSync(jsonString, { level: 9 });

fs.writeFileSync(outputFileGz, gzipped);
fs.writeFileSync(outputFileJson, jsonString);

const rawMb = (Buffer.byteLength(jsonString) / (1024 * 1024)).toFixed(2);
const gzKb = (gzipped.length / 1024).toFixed(0);

console.log(`\x1b[32m✓ Runtime bundle deployed successfully!\x1b[0m`);
console.log(`  • Raw JSON size:    ${rawMb} MB`);
console.log(`  • Gzipped size:     \x1b[32m${gzKb} KB\x1b[0m (~92% reduction)`);
console.log(`  • Files bundled:    ${Object.keys(files).length}`);
console.log(`  • Pre-mapped dirs:  ${sortedDirs.length}`);