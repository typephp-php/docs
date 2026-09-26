import { PHP, loadPHPRuntime } from '@php-wasm/universal';
import { getPHPLoaderModule } from '@php-wasm/web-8-5';

self.addEventListener('error', (event) => {
  console.error('[Worker Error Detail]', event.message, event.filename, event.lineno, event.error);
});
self.addEventListener('unhandledrejection', (event) => {
  console.error('[Worker Rejection Detail]', event.reason);
});

let php: PHP | null = null;
let isReady = false;

const RUNNER_PHP = `<?php
declare(strict_types=1);

ini_set('html_errors', '0');
ini_set('display_errors', '0');
error_reporting(E_ALL);

if (!defined('STDERR')) {
    define('STDERR', fopen('php://stderr', 'wb'));
}
if (!defined('STDOUT')) {
    define('STDOUT', fopen('php://stdout', 'wb'));
}

require_once '/typephp/vendor/autoload.php';

function sanitizePath(string $path): string {
    $normalized = str_replace('\\\\', '/', $path);
    if (str_ends_with($normalized, 'transformed.php') || str_ends_with($normalized, 'playground.php')) {
        return 'playground.php';
    }
    return basename($normalized);
}

function sanitizeText(string $text): string {
    return str_replace(
        ['/workspace/transformed.php', '/workspace/playground.php', 'transformed.php'],
        'playground.php',
        $text
    );
}

function formatExceptionTrace(\\Throwable $e): string {
    $className = get_class($e);
    $message = sanitizeText($e->getMessage());
    $file = sanitizePath($e->getFile());
    $line = $e->getLine();

    $output = "Fatal error: Uncaught {$className}: {$message} in {$file} on line {$line}\\n";
    $output .= "Stack trace:\\n";

    $rawTrace = $e->getTrace();
    $visibleFrameIndex = 0;

    foreach ($rawTrace as $frame) {
        $frameFile = isset($frame['file']) ? sanitizePath($frame['file']) : '';
        $frameLine = isset($frame['line']) ? "({$frame['line']})" : '';

        if (
            $frameFile === '' ||
            str_contains($frameFile, 'runner.php') ||
            str_contains($frameFile, '/typephp/') ||
            (isset($frame['class']) && str_starts_with($frame['class'], 'TypePHP\\\\Internal\\\\'))
        ) {
            continue;
        }

        $call = '';
        if (isset($frame['class'])) {
            $call .= $frame['class'] . $frame['type'];
        }
        $call .= ($frame['function'] ?? '{main}');

        if ($call !== '{main}') {
            $argsSummary = [];
            if (!empty($frame['args'])) {
                foreach ($frame['args'] as $arg) {
                    $argsSummary[] = match (get_debug_type($arg)) {
                        'string' => "'" . (strlen($arg) > 15 ? substr($arg, 0, 12) . '...' : $arg) . "'",
                        'int', 'float' => (string) $arg,
                        'bool' => $arg ? 'true' : 'false',
                        'null' => 'null',
                        'array' => 'Array',
                        default => is_object($arg) ? get_class($arg) : get_debug_type($arg),
                    };
                }
            }
            $call .= '(' . implode(', ', $argsSummary) . ')';
        }

        $output .= "#{$visibleFrameIndex} {$frameFile}{$frameLine}: {$call}\\n";
        $visibleFrameIndex++;
    }

    $output .= "#{$visibleFrameIndex} {main}\\n";
    $output .= "  thrown in {$file} on line {$line}\\n";

    return $output;
}

$userConfig = [];
if (file_exists('/workspace/config.json')) {
    $raw = file_get_contents('/workspace/config.json');
    if ($raw !== false) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $userConfig = $decoded;
        }
    }
}

\\TypePHP\\Internal\\Util\\Config::set([
    'cache' => false,
    'include' => ['/workspace/playground.php', '/workspace/transformed.php'],
    'exclude' => ['/typephp/**'],
    'vendor_boundary_only' => false,
    'array_validation' => $userConfig['arrayValidation'] ?? 'full',
    'strict_return_generic_invariance' => (bool) ($userConfig['strictReturnGenericInvariance'] ?? true),
    'respect_native_nullability' => (bool) ($userConfig['respectNativeNullability'] ?? true),
    'respect_ignore_tags' => (bool) ($userConfig['respectIgnoreTags'] ?? true),
]);

$source = file_get_contents('/workspace/playground.php');
if ($source === false || trim($source) === '') {
    exit(0);
}

if (!str_starts_with(trim($source), '<?php')) {
    $source = "<?php\\n" . $source;
}

try {
    $transformed = \\TypePHP\\Internal\\Io\\StreamWrapper::transformSource($source, '/workspace/playground.php');
    file_put_contents('/workspace/transformed.php', $transformed);
} catch (\\PhpParser\\Error $e) {
    $line = $e->getStartLine();
    $rawMsg = $e->getRawMessage();
    file_put_contents('php://stderr', "Parse error: syntax error, {$rawMsg} in playground.php on line {$line}\\n");
    exit(255);
} catch (\\Throwable $e) {
    file_put_contents('php://stderr', formatExceptionTrace($e));
    exit(255);
}

try {
    require '/workspace/transformed.php';
} catch (\\Throwable $e) {
    file_put_contents('php://stderr', formatExceptionTrace($e));
    exit(255);
}
`;

const TRANSFORMER_PHP = `<?php
declare(strict_types=1);

ini_set('html_errors', '0');
ini_set('display_errors', '0');

require_once '/typephp/vendor/autoload.php';

$userConfig = [];
if (file_exists('/workspace/config.json')) {
    $raw = file_get_contents('/workspace/config.json');
    if ($raw !== false) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $userConfig = $decoded;
        }
    }
}

\\TypePHP\\Internal\\Util\\Config::set([
    'cache' => false,
    'respect_ignore_tags' => (bool) ($userConfig['respectIgnoreTags'] ?? true),
]);

$source = file_get_contents('/workspace/playground.php');
if ($source === false || trim($source) === '') {
    exit(0);
}

if (!str_starts_with(trim($source), '<?php')) {
    $source = "<?php\\n" . $source;
}

try {
    echo \\TypePHP\\Internal\\Io\\StreamWrapper::transformSource($source, '/workspace/playground.php');
} catch (\\Throwable $e) {
    echo $source;
}
`;

function makeDirectory(targetPhp: PHP, dirPath: string) {
  const parts = dirPath.split('/').filter(Boolean);
  let current = '';

  for (const part of parts) {
    current += '/' + part;
    try {
      targetPhp.mkdir(current);
    } catch {
      // Directory already exists
    }
  }
}

async function initRuntime(baseUrl: string) {
  try {
    self.postMessage({ type: 'STATUS', message: 'Loading PHP 8.5 WebAssembly engine...' });

    const loaderModule = await getPHPLoaderModule('asyncify');
    const runtimeId = await loadPHPRuntime(loaderModule);
    php = new PHP(runtimeId);

    self.postMessage({ type: 'STATUS', message: 'Mounting TypePHP virtual filesystem...' });

    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const bundleUrl = `${cleanBaseUrl}wasm/typephp-runtime.json?t=${Date.now()}`;
    const response = await fetch(bundleUrl, { cache: 'no-cache' });

    if (!response.ok) {
      throw new Error(`Failed to load runtime bundle: ${response.statusText} (${bundleUrl})`);
    }

    const vfs: Record<string, string> = await response.json();
    const createdDirs = new Set<string>();

    for (const [filePath, content] of Object.entries(vfs)) {
      const lastSlash = filePath.lastIndexOf('/');
      if (lastSlash > 0) {
        const dir = filePath.substring(0, lastSlash);
        if (!createdDirs.has(dir)) {
          makeDirectory(php, dir);
          createdDirs.add(dir);
        }
      }
      php.writeFile(filePath, content);
    }

    makeDirectory(php, '/workspace');
    php.writeFile('/workspace/runner.php', RUNNER_PHP);
    php.writeFile('/workspace/transformer.php', TRANSFORMER_PHP);

    isReady = true;
    self.postMessage({ type: 'READY', version: 'PHP 8.5 (WebAssembly)' });
  } catch (error: any) {
    console.error('[Playground Worker Error]', error);
    self.postMessage({
      type: 'INIT_ERROR',
      error: error?.message || String(error),
    });
  }
}

async function runCode(code: string, config?: any) {
  if (!php || !isReady) {
    self.postMessage({
      type: 'RUN_RESULT',
      stdout: '',
      stderr: 'PHP 8.5 engine is still initializing. Please wait a moment...',
      exitCode: 1,
      duration: '0.0',
    });
    return;
  }

  try {
    if (config) {
      php.writeFile('/workspace/config.json', JSON.stringify(config));
    }
    php.writeFile('/workspace/playground.php', code);

    const startTime = performance.now();
    const runResult = await php.runStream({
      scriptPath: '/workspace/runner.php',
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      runResult.stdoutText,
      runResult.stderrText,
      runResult.exitCode,
    ]);

    const duration = (performance.now() - startTime).toFixed(1);

    self.postMessage({
      type: 'RUN_RESULT',
      stdout,
      stderr,
      exitCode,
      duration,
    });
  } catch (error: any) {
    self.postMessage({
      type: 'RUN_RESULT',
      stdout: '',
      stderr: `Worker Execution Error: ${error?.message || String(error)}`,
      exitCode: 255,
      duration: '0.0',
    });
  }
}

async function transformCode(code: string, config?: any) {
  if (!php || !isReady) return;

  try {
    if (config) {
      php.writeFile('/workspace/config.json', JSON.stringify(config));
    }
    php.writeFile('/workspace/playground.php', code);

    const runResult = await php.runStream({
      scriptPath: '/workspace/transformer.php',
    });

    const transformedCode = await runResult.stdoutText;

    self.postMessage({
      type: 'TRANSFORM_RESULT',
      transformedCode,
    });
  } catch (error: any) {
    self.postMessage({
      type: 'TRANSFORM_RESULT',
      transformedCode: code,
    });
  }
}

self.onmessage = async (event: MessageEvent) => {
  const { action, code, baseUrl, config } = event.data;

  switch (action) {
    case 'INIT':
      await initRuntime(baseUrl || '/docs/');
      break;
    case 'RUN':
      await runCode(code || '', config);
      break;
    case 'TRANSFORM':
      await transformCode(code || '', config);
      break;
    default:
      console.warn('[Playground Worker] Unknown action:', action);
  }
};