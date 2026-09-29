import { PHP, loadPHPRuntime } from '@php-wasm/universal';
import { getPHPLoaderModule } from '@php-wasm/web-8-5';

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

use TypePHP\\Internal\\Util\\Config;
use TypePHP\\Internal\\Io\\StreamWrapper;

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
    $filteredFrames = [];

    foreach ($rawTrace as $frame) {
        $frameFile = isset($frame['file']) ? sanitizePath($frame['file']) : '';
        $frameLine = isset($frame['line']) ? $frame['line'] : null;
        $frameFunc = $frame['function'] ?? '';
        $frameClass = $frame['class'] ?? '';

        if (
            $frameFile === '' ||
            str_contains($frameFile, 'runner.php') ||
            str_contains($frameFile, '/typephp/') ||
            str_starts_with($frameClass, 'TypePHP\\\\')
        ) {
            continue;
        }

        if ($frameFunc === '{closure}' || str_contains($frameFunc, '{closure')) {
            if ($frameLine !== null && $frameLine === $line) {
                continue;
            }
            if (!empty($frame['args']) && is_string($frame['args'][0] ?? null) && str_contains($frame['args'][0], '<')) {
                continue;
            }
        }

        if ($frameLine !== null && $frameLine === $line && $frameFunc === '__construct') {
            continue;
        }

        $filteredFrames[] = $frame;
    }

    if (empty($filteredFrames)) {
        $output .= "#0 {main}\\n";
        $output .= "  thrown in {$file} on line {$line}\\n";
        return $output;
    }

    $visibleIndex = 0;
    foreach ($filteredFrames as $frame) {
        $frameFile = isset($frame['file']) ? sanitizePath($frame['file']) : $file;
        $frameLineStr = isset($frame['line']) ? "({$frame['line']})" : '';

        $call = '';
        if (isset($frame['class'])) {
            $call .= $frame['class'] . ($frame['type'] ?? '->');
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

        $output .= "#{$visibleIndex} {$frameFile}{$frameLineStr}: {$call}\\n";
        $visibleIndex++;
    }

    $output .= "#{$visibleIndex} {main}\\n";
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

$isEnabled = (bool) ($userConfig['enabled'] ?? true);
$ignoreDepth = isset($userConfig['ignoreTraceDepth']) ? max(1, (int) $userConfig['ignoreTraceDepth']) : 25;
$magicPropertyReads = (bool) ($userConfig['magicPropertyReads'] ?? false);
$userInlineVars = $userConfig['inlineVars'] ?? [];

Config::set([
    'enabled' => $isEnabled,
    'ignore_trace_depth' => $ignoreDepth,
    'cache' => false,
    'include' => ['/workspace/playground.php', '/workspace/transformed.php'],
    'exclude' => ['/typephp/**'],
    'vendor_boundary_only' => false,
    'magic_properties' => [
        'write' => true,
        'read' => $magicPropertyReads,
    ],
    'array_validation' => $userConfig['arrayValidation'] ?? 'full',
    'strict_return_generic_invariance' => (bool) ($userConfig['strictReturnGenericInvariance'] ?? true),
    'respect_native_nullability' => (bool) ($userConfig['respectNativeNullability'] ?? true),
    'respect_ignore_tags' => (bool) ($userConfig['respectIgnoreTags'] ?? true),
    'inline_vars' => [
        'properties' => (bool) ($userInlineVars['properties'] ?? true),
        'generics'   => (bool) ($userInlineVars['generics'] ?? true),
        'callables'  => (bool) ($userInlineVars['callables'] ?? true),
        'scalars'    => (bool) ($userInlineVars['scalars'] ?? true),
        'arrays'     => (bool) ($userInlineVars['arrays'] ?? true),
        'objects'    => (bool) ($userInlineVars['objects'] ?? true),
    ],
]);

$source = file_get_contents('/workspace/playground.php');
if ($source === false || trim($source) === '') {
    exit(0);
}

if (!str_starts_with(trim($source), '<?php')) {
    $source = "<?php\\n" . $source;
}

if (!$isEnabled) {
    try {
        require '/workspace/playground.php';
    } catch (\\Throwable $e) {
        file_put_contents('php://stderr', formatExceptionTrace($e));
        exit(255);
    }
    exit(0);
}

try {
    $transformed = StreamWrapper::transformSource($source, '/workspace/playground.php');
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

use TypePHP\\Internal\\Util\\Config;
use TypePHP\\Internal\\Io\\StreamWrapper;

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

$isEnabled = (bool) ($userConfig['enabled'] ?? true);
$source = file_get_contents('/workspace/playground.php');
if ($source === false || trim($source) === '') {
    exit(0);
}

if (!str_starts_with(trim($source), '<?php')) {
    $source = "<?php\\n" . $source;
}

if (!$isEnabled) {
    echo $source;
    exit(0);
}

$magicPropertyReads = (bool) ($userConfig['magicPropertyReads'] ?? false);
$userInlineVars = $userConfig['inlineVars'] ?? [];

Config::set([
    'cache' => false,
    'magic_properties' => [
        'write' => true,
        'read' => $magicPropertyReads,
    ],
    'respect_ignore_tags' => (bool) ($userConfig['respectIgnoreTags'] ?? true),
    'inline_vars' => [
        'properties' => (bool) ($userInlineVars['properties'] ?? true),
        'generics'   => (bool) ($userInlineVars['generics'] ?? true),
        'callables'  => (bool) ($userInlineVars['callables'] ?? true),
        'scalars'    => (bool) ($userInlineVars['scalars'] ?? true),
        'arrays'     => (bool) ($userInlineVars['arrays'] ?? true),
        'objects'    => (bool) ($userInlineVars['objects'] ?? true),
    ],
]);

try {
    echo StreamWrapper::transformSource($source, '/workspace/playground.php');
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
      // Directory exists
    }
  }
}

async function fetchBundle(baseUrl: string): Promise<{ dirs: string[]; files: Record<string, string> }> {
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
  const gzUrl = `${cleanBaseUrl}wasm/typephp-runtime.json.gz`;
  const fallbackUrl = `${cleanBaseUrl}wasm/typephp-runtime.json`;

  try {
    const res = await fetch(gzUrl);
    if (res.ok && typeof DecompressionStream !== 'undefined') {
      const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
      const text = await new Response(stream).text();
      return JSON.parse(text);
    }
  } catch {
    // Fall back to raw JSON if decompression or gzip fails
  }

  const res = await fetch(fallbackUrl);
  if (!res.ok) {
    throw new Error(`Failed to load runtime bundle (${fallbackUrl})`);
  }
  const data = await res.json();
  if (data.dirs && data.files) {
    return data;
  }

  return { dirs: [], files: data };
}

async function initRuntime(baseUrl: string) {
  try {
    self.postMessage({ type: 'STATUS', message: 'Loading PHP 8.5 WebAssembly engine...' });

    const bundlePromise = fetchBundle(baseUrl);

    const loaderModule = await getPHPLoaderModule('asyncify');
    const runtimeId = await loadPHPRuntime(loaderModule);
    php = new PHP(runtimeId);

    self.postMessage({ type: 'STATUS', message: 'Mounting virtual filesystem...' });

    const bundle = await bundlePromise;

    for (const dir of bundle.dirs) {
      try {
        php.mkdir(dir);
      } catch {
        // Safe ignore
      }
    }

    for (const [filePath, content] of Object.entries(bundle.files)) {
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
  if (!php || !isReady) return;

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
  }
};