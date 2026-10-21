<!-- docs/.vitepress/theme/components/TypePHPSnippet.vue -->
<template>
  <div class="typephp-snippet-card">
    <!-- Header Toolbar -->
    <div class="snippet-header">
      <div class="header-left">
        <svg class="php-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <span class="snippet-title">{{ title || 'TypePHP Interactive' }}</span>
      </div>

      <div class="header-right">
        <!-- View Switcher -->
        <div class="view-pill-group">
          <button
            :class="['view-pill-btn', { active: currentView === 'source' }]"
            @click="currentView = 'source'"
          >
            Source
          </button>
          <button
            :class="['view-pill-btn', { active: currentView === 'transformed' }]"
            @click="toggleTransformedView"
          >
            Transformed
          </button>
        </div>

        <!-- Copy Button -->
        <button class="icon-btn" :title="copied ? 'Copied!' : 'Copy Code'" @click="copyCode">
          <svg v-if="!copied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>

        <!-- Run Button -->
        <button
          class="run-snippet-btn"
          :disabled="isRunning"
          @click="runSnippet"
        >
          <span v-if="isRunning" class="spinner"></span>
          <svg v-else viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{{ isRunning ? 'Running...' : 'Run' }}</span>
        </button>
      </div>
    </div>

    <!-- Code Block Body -->
    <div class="snippet-body">
      <!-- 1. Source View (VitePress Slot) -->
      <div v-show="currentView === 'source'" ref="slotWrapper" class="slot-content">
        <slot>
          <pre class="snippet-pre"><code>{{ code }}</code></pre>
        </slot>
      </div>

      <!-- 2. Transformed View (Synchronized 1:1 with Source) -->
      <div v-show="currentView === 'transformed'" class="transformed-block">
        <span class="lang-badge">php</span>
        <div class="line-numbers-wrapper" aria-hidden="true">
          <span v-for="n in transformedLineCount" :key="n" class="line-number">{{ n }}</span>
        </div>
        <pre class="snippet-pre"><code v-html="highlightedTransformedCode || 'Generating AST transformation...'"></code></pre>
      </div>
    </div>

    <!-- Output Console -->
    <div v-if="hasRun" class="snippet-console">
      <div class="console-header">
        <div class="console-stats">
          <span :class="['exit-tag', exitCode === 0 ? 'success' : 'error']">
            Exit {{ exitCode ?? 0 }}
          </span>
          <span v-if="duration" class="duration-tag">{{ duration }}ms</span>
        </div>
        <button class="close-console-btn" title="Close Output" @click="hasRun = false">&times;</button>
      </div>

      <div class="console-output">
        <pre v-if="stdout" class="stdout-stream">{{ stdout }}</pre>
        <pre v-if="stderr" class="stderr-stream">{{ stderr }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useData } from 'vitepress';
import { getTypePHPEngine, type RunResult } from '../utils/typephp-engine';

const props = withDefaults(defineProps<{
  code?: string;
  title?: string;
  config?: Record<string, any>;
}>(), {
  code: '',
  title: 'TypePHP Example',
  config: () => ({}),
});

const { site } = useData();
const slotWrapper = ref<HTMLDivElement | null>(null);

const currentView = ref<'source' | 'transformed'>('source');
const transformedCode = ref<string>('');
const isRunning = ref<boolean>(false);
const hasRun = ref<boolean>(false);
const copied = ref<boolean>(false);

const stdout = ref<string>('');
const stderr = ref<string>('');
const exitCode = ref<number | null>(null);
const duration = ref<string>('');

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightPhp(code: string): string {
  const TOKEN_REGEX = new RegExp(
    [
      // 1. Comments & DocBlocks
      '(/\\*\\*[\\s\\S]*?\\*/|/\\*[\\s\\S]*?\\*/|//.*|#.*)',
      // 2. Strings
      `('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*")`,
      // 3. PHP Open/Close Tags
      '(<\\?(?:php|=)?|\\?>)',
      // 4. Variables
      '(\\$[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*)',
      // 5. Function calls (e.g. add(), get_class())
      '(\\b[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*(?=\\s*\\())',
      // 6. Keywords
      '(\\b(?:declare|use|class|interface|trait|extends|implements|public|protected|private|static|readonly|function|fn|return|new|if|else|elseif|isset|empty|throw|try|catch|finally|match|switch|case|break|continue|foreach|for|while|as|yield|echo|print)\\b)',
      // 7. Types, Builtins, Namespaces, Constants
      '(\\\\?[A-Z][a-zA-Z0-9_]*(?:\\\\[a-zA-Z0-9_]+)*\\b|\\b(?:int|string|bool|boolean|float|double|array|void|never|mixed|object|callable|iterable|true|false|null|self|parent|PHP_EOL|strict_types)\\b)',
      // 8. Numbers
      '(\\b\\d+(?:\\.\\d+)?\\b)',
    ].join('|'),
    'g'
  );

  let lastIndex = 0;
  let html = '';
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(code.slice(lastIndex, match.index));
    }

    const [
      full,
      comment,
      str,
      phpTag,
      variable,
      fnCall,
      keyword,
      typeOrClass,
      number,
    ] = match;

    if (comment) {
      let c = escapeHtml(comment);
      c = c.replace(/(@[a-zA-Z0-9_\-]+)/g, '<span class="tok-tag">$1</span>');
      c = c.replace(/\b([A-Z][a-zA-Z0-9_]*|positive-int|non-empty-string|string|int|array|mixed)\b/g, '<span class="tok-type">$1</span>');
      html += `<span class="tok-comment">${c}</span>`;
    } else if (str) {
      html += `<span class="tok-string">${escapeHtml(str)}</span>`;
    } else if (phpTag) {
      html += `<span class="tok-php">${escapeHtml(phpTag)}</span>`;
    } else if (variable) {
      html += `<span class="tok-var">${escapeHtml(variable)}</span>`;
    } else if (fnCall) {
      html += `<span class="tok-fn">${escapeHtml(fnCall)}</span>`;
    } else if (keyword) {
      html += `<span class="tok-keyword">${escapeHtml(keyword)}</span>`;
    } else if (typeOrClass) {
      html += `<span class="tok-type">${escapeHtml(typeOrClass)}</span>`;
    } else if (number) {
      html += `<span class="tok-number">${escapeHtml(number)}</span>`;
    } else {
      html += escapeHtml(full);
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    html += escapeHtml(code.slice(lastIndex));
  }

  return html;
}

function extractCode(): string {
  if (props.code && props.code.trim()) {
    return props.code.trim();
  }
  if (!slotWrapper.value) return '';

  const codeEl = slotWrapper.value.querySelector('pre code') || slotWrapper.value.querySelector('code');
  return (codeEl?.textContent || slotWrapper.value.textContent || '').trim();
}

const transformedLineCount = computed(() => {
  if (!transformedCode.value) return 0;
  return transformedCode.value.split('\n').length;
});

const highlightedTransformedCode = computed(() => {
  if (!transformedCode.value) return '';
  return highlightPhp(transformedCode.value);
});

async function runSnippet() {
  const codeToRun = extractCode();
  if (!codeToRun) return;

  isRunning.value = true;
  hasRun.value = true;
  stdout.value = '';
  stderr.value = '';

  const engine = getTypePHPEngine(site.value.base || '/docs/');

  try {
    const res: RunResult = await engine.run(codeToRun, props.config);
    stdout.value = res.stdout;
    stderr.value = res.stderr;
    exitCode.value = res.exitCode;
    duration.value = res.duration;
  } catch (err: any) {
    stderr.value = `Execution Error: ${err?.message || err}`;
    exitCode.value = 255;
  } finally {
    isRunning.value = false;
  }
}

async function toggleTransformedView() {
  currentView.value = 'transformed';
  if (transformedCode.value) return;

  const codeToTransform = extractCode();
  if (!codeToTransform) return;

  const engine = getTypePHPEngine(site.value.base || '/docs/');
  try {
    const res = await engine.transform(codeToTransform, props.config);
    transformedCode.value = res.transformedCode;
  } catch (err: any) {
    transformedCode.value = `// AST Transformation Error: ${err?.message || err}`;
  }
}

function copyCode() {
  const text = currentView.value === 'source' ? extractCode() : transformedCode.value;
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}
</script>

<style>
/* CSS Variables for Dynamic Dark/Light Theme Switching */
.typephp-snippet-card {
  --snip-pre-color: #24292f;
  --snip-keyword: #cf222e;
  --snip-fn: #8250df;
  --snip-string: #0a3069;
  --snip-type: #0550ae;
  --snip-number: #0550ae;
  --snip-var: #24292f;
  --snip-comment: #57606a;
  --snip-tag: #cf222e;
}

html.dark .typephp-snippet-card {
  --snip-pre-color: #e1e4e8;
  --snip-keyword: #f97583;
  --snip-fn: #d2a8ff;
  --snip-string: #ffab70;
  --snip-type: #79b8ff;
  --snip-number: #79b8ff;
  --snip-var: #e1e4e8;
  --snip-comment: #8b949e;
  --snip-tag: #f97583;
}
</style>

<style scoped>
.typephp-snippet-card {
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-code-block-bg, var(--vp-c-bg-soft));
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

.snippet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--vp-c-bg-mute);
  border-bottom: 1px solid var(--vp-c-divider);
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.php-icon {
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.snippet-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--vp-font-family-mono);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.view-pill-group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.view-pill-btn {
  padding: 2px 7px;
  font-size: 10px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.view-pill-btn.active {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.icon-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.run-snippet-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  border: none;
  background: var(--vp-c-brand-1);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.run-snippet-btn:hover:not(:disabled) {
  background: var(--vp-c-brand-2);
}

.run-snippet-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.snippet-body {
  position: relative;
  background: var(--vp-code-block-bg, var(--vp-c-bg-soft));
}

.slot-content :deep(div[class*='language-']) {
  margin: 0 !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
}

.slot-content :deep(button.copy) {
  display: none !important;
}

/* Transformed Code Block */
.transformed-block {
  position: relative;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
}

/* Language Badge */
.lang-badge {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vp-code-lang-color, var(--vp-c-text-3));
  font-family: var(--vp-font-family-mono);
  user-select: none;
  z-index: 2;
}

/* Line Numbers Gutter: Solid 32px on desktop and mobile */
.line-numbers-wrapper {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  width: 32px !important;
  text-align: center;
  padding: 20px 0 !important;
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 14px);
  line-height: var(--vp-code-line-height, 1.7);
  color: var(--vp-code-line-number-color, var(--vp-c-text-3));
  border-right: 1px solid var(--vp-code-block-divider-color, rgba(60, 60, 67, 0.08));
  background-color: var(--vp-code-block-bg, var(--vp-c-bg-soft)) !important;
  user-select: none;
  box-sizing: border-box;
}

.line-number {
  display: block;
}

/* Desktop: 32px gutter + 24px padding = 56px left offset */
.snippet-pre {
  margin: 0 !important;
  padding: 20px 24px 20px 56px !important;
  background: transparent !important;
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 14px);
  line-height: var(--vp-code-line-height, 1.7);
  overflow-x: auto;
  box-sizing: border-box;
  color: var(--snip-pre-color) !important;
}

.snippet-pre code {
  display: block;
  width: fit-content;
  min-width: 100%;
}

/* Mobile: 32px gutter + 16px padding = 48px left offset (Matching custom.css) */
@media (max-width: 639px) {
  .line-numbers-wrapper {
    padding: 16px 0 !important;
  }

  .snippet-pre {
    padding: 16px 16px 16px 48px !important;
  }
}

/* Syntax Token Colors (Using CSS Variables) */
:deep(.tok-keyword) { color: var(--snip-keyword) !important; font-weight: normal; }
:deep(.tok-php) { color: var(--snip-keyword) !important; font-weight: normal; }
:deep(.tok-fn) { color: var(--snip-fn) !important; }
:deep(.tok-string) { color: var(--snip-string) !important; }
:deep(.tok-number) { color: var(--snip-number) !important; }
:deep(.tok-type) { color: var(--snip-type) !important; }
:deep(.tok-var) { color: var(--snip-var) !important; }
:deep(.tok-comment) { color: var(--snip-comment) !important; font-style: italic; }
:deep(.tok-tag) { color: var(--snip-tag) !important; font-weight: 600; }

/* Console Output */
.snippet-console {
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt, rgba(0, 0, 0, 0.15));
}

.console-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: var(--vp-c-bg-mute);
  border-bottom: 1px solid var(--vp-c-divider);
}

.console-stats {
  display: flex;
  align-items: center;
  gap: 6px;
}

.exit-tag {
  font-size: 9.5px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--vp-font-family-mono);
}

.exit-tag.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.exit-tag.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.duration-tag {
  font-size: 10px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.close-console-btn {
  background: none;
  border: none;
  font-size: 15px;
  line-height: 1;
  color: var(--vp-c-text-3);
  cursor: pointer;
}

.close-console-btn:hover {
  color: var(--vp-c-text-1);
}

.console-output {
  padding: 8px 12px;
  max-height: 220px;
  overflow-y: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 11.5px;
}

.stdout-stream {
  margin: 0;
  white-space: pre-wrap;
  color: var(--vp-c-text-1);
}

.stderr-stream {
  margin: 4px 0 0 0;
  white-space: pre-wrap;
  color: #f87171;
  background: rgba(239, 68, 68, 0.08);
  border-left: 2px solid #ef4444;
  padding: 6px 8px;
  border-radius: 3px;
}

.spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 640px) {
  .snippet-header {
    flex-wrap: wrap;
    padding: 6px 8px;
  }
  .header-left {
    width: 100%;
    margin-bottom: 2px;
  }
}
</style>