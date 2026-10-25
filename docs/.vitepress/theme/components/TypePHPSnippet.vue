<template>
  <div class="typephp-snippet-card">
    <!-- Header Toolbar -->
    <div class="snippet-header">
      <div class="header-left">
        <div class="title-cluster">
          <svg class="php-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span class="snippet-title" :title="title || 'TypePHP Interactive'">{{ title || 'TypePHP Interactive' }}</span>
        </div>

        <!-- Active Config Badges -->
        <div v-if="activeConfigBadges.length > 0" class="snippet-config-badges">
          <span v-for="badge in activeConfigBadges" :key="badge" class="config-badge-pill">
            {{ badge }}
          </span>
        </div>
      </div>

      <div class="header-right">
        <!-- View Switcher -->
        <div v-if="!hideToggle" class="view-pill-group">
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

        <!-- Action Tools Cluster -->
        <div class="actions-cluster">
          <!-- Reusable Full Engine Config Popover -->
          <PlaygroundConfigPopover
            v-model="localConfig"
            :has-custom-config="hasCustomConfig"
            :compact="true"
            @reset="resetToSnippetDefaults"
          />

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
            <span>{{ isRunning ? '...' : 'Run' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Code Block Body -->
    <div class="snippet-body">
      <!-- 1. Source View -->
      <div v-show="currentView === 'source'" ref="slotWrapper" class="slot-content">
        <slot>
          <pre class="snippet-pre"><code>{{ code }}</code></pre>
        </slot>
      </div>

      <!-- 2. Transformed View -->
      <div v-show="currentView === 'transformed'" class="transformed-block">
        <div v-if="transformedLineCount > 0" class="line-numbers-wrapper" aria-hidden="true">
          <span v-for="n in transformedLineCount" :key="n" class="line-number">{{ n }}</span>
        </div>

        <div v-if="isTransforming && !transformedCode" class="transform-loading-state">
          <span class="spinner dark"></span>
          <span>Generating AST transformation...</span>
        </div>

        <pre v-else class="snippet-pre"><code v-html="highlightedTransformedCode || 'Generating AST transformation...'"></code></pre>
      </div>
    </div>

    <!-- Modular Embedded Console Output & Audit Report -->
    <PlaygroundOutput
      v-if="hasRun"
      mode="embedded"
      :stdout="stdout"
      :stderr="stderr"
      :exit-code="exitCode"
      :duration="duration"
      :status-message="''"
      :is-running="isRunning"
      :report="report"
      :is-report-mode-active="localConfig.onViolation === 'report'"
      :report-view-mode="snippetReportViewMode"
      @clear="clearConsole"
      @clear-report="report = null"
      @update:report-view-mode="snippetReportViewMode = $event"
      @close="hasRun = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useData } from 'vitepress';
import { getTypePHPEngine, type RunResult } from '../utils/typephp-engine';
import { DEFAULT_PLAYGROUND_CONFIG, type PlaygroundConfig, type AuditReportDocument } from '../presets';
import PlaygroundConfigPopover from './PlaygroundConfigPopover.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const props = withDefaults(defineProps<{
  code?: string;
  title?: string;
  config?: Partial<PlaygroundConfig>;
  defaultView?: 'source' | 'transformed';
  hideToggle?: boolean;
}>(), {
  code: '',
  title: 'TypePHP Interactive',
  config: () => ({}),
  defaultView: 'source',
  hideToggle: false,
});

const { site } = useData();
const slotWrapper = ref<HTMLDivElement | null>(null);

const currentView = ref<'source' | 'transformed'>(props.defaultView);
const transformedCode = ref<string>('');
const isRunning = ref<boolean>(false);
const isTransforming = ref<boolean>(false);
const hasRun = ref<boolean>(false);
const copied = ref<boolean>(false);

const stdout = ref<string>('');
const stderr = ref<string>('');
const exitCode = ref<number | null>(null);
const duration = ref<string>('');
const report = ref<AuditReportDocument | null>(null);
const snippetReportViewMode = ref<'cards' | 'json'>('cards');

const localConfig = ref<PlaygroundConfig>({
  ...DEFAULT_PLAYGROUND_CONFIG,
  ...props.config,
});

watch(() => props.config, (newConf) => {
  localConfig.value = {
    ...DEFAULT_PLAYGROUND_CONFIG,
    ...newConf,
  };
}, { deep: true });

watch(localConfig, () => {
  transformedCode.value = '';
  if (currentView.value === 'transformed') {
    toggleTransformedView();
  }
  if (hasRun.value) {
    runSnippet();
  }
}, { deep: true });

const hasCustomConfig = computed(() => {
  return (
    localConfig.value.enabled !== DEFAULT_PLAYGROUND_CONFIG.enabled ||
    localConfig.value.eliminateStaticallyProvenChecks !== DEFAULT_PLAYGROUND_CONFIG.eliminateStaticallyProvenChecks ||
    localConfig.value.strictReturnGenericInvariance !== DEFAULT_PLAYGROUND_CONFIG.strictReturnGenericInvariance ||
    localConfig.value.magicPropertyReads !== DEFAULT_PLAYGROUND_CONFIG.magicPropertyReads ||
    localConfig.value.arrayValidation !== DEFAULT_PLAYGROUND_CONFIG.arrayValidation ||
    localConfig.value.redactValues !== DEFAULT_PLAYGROUND_CONFIG.redactValues ||
    localConfig.value.onViolation !== DEFAULT_PLAYGROUND_CONFIG.onViolation
  );
});

const activeConfigBadges = computed(() => {
  const badges: string[] = [];
  if (!localConfig.value.strictReturnGenericInvariance) {
    badges.push('Pragmatic Returns');
  }
  if (!localConfig.value.eliminateStaticallyProvenChecks) {
    badges.push('No AST Elimination');
  }
  if (localConfig.value.magicPropertyReads) {
    badges.push('Strict __get');
  }
  if (localConfig.value.arrayValidation === 'hybrid') {
    badges.push('Hybrid Array');
  }
  if (localConfig.value.onViolation === 'warn') {
    badges.push('Warn Mode');
  } else if (localConfig.value.onViolation === 'report') {
    badges.push('Report Mode');
  }
  return badges;
});

function resetToSnippetDefaults() {
  localConfig.value = {
    ...DEFAULT_PLAYGROUND_CONFIG,
    ...props.config,
  };
}

function clearConsole() {
  stdout.value = '';
  stderr.value = '';
  exitCode.value = null;
  duration.value = '';
}

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
      '(/\\*\\*[\\s\\S]*?\\*/|/\\*[\\s\\S]*?\\*/|//.*|#.*)',
      `('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*")`,
      '(<\\?(?:php|=)?|\\?>)',
      '(\\$[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*)',
      '(\\b[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*(?=\\s*\\())',
      '(\\b(?:declare|use|class|interface|trait|enum|extends|implements|public|protected|private|static|readonly|function|fn|return|new|if|else|elseif|isset|empty|throw|try|catch|finally|match|switch|case|break|continue|foreach|for|while|as|yield|echo|print)\\b)',
      '(\\\\?[A-Z][a-zA-Z0-9_]*(?:\\\\[a-zA-Z0-9_]+)*\\b|\\b(?:int|string|bool|boolean|float|double|array|void|never|mixed|object|callable|iterable|true|false|null|self|parent|PHP_EOL|strict_types)\\b)',
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
      full, comment, str, phpTag, variable, fnCall, keyword, typeOrClass, number,
    ] = match;

    if (comment) {
      let c = escapeHtml(comment);
      c = c.replace(/(@[a-zA-Z0-9_\-]+)/g, '<span class="tok-tag">$1</span>');
      c = c.replace(/\b([A-Z][a-zA-Z0-9_]*|positive-int|negative-int|non-empty-string|string|int|array|mixed)\b/g, '<span class="tok-type">$1</span>');
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
  report.value = null;

  const engine = getTypePHPEngine(site.value.base || '/docs/');

  try {
    const cleanConfig = JSON.parse(JSON.stringify(localConfig.value));
    const res: RunResult = await engine.run(codeToRun, cleanConfig);
    stdout.value = res.stdout;
    stderr.value = res.stderr;
    exitCode.value = res.exitCode;
    duration.value = res.duration;
    report.value = res.report || null;
  } catch (err: any) {
    stderr.value = `Execution Error: ${err?.message || err}`;
    exitCode.value = 255;
  } finally {
    isRunning.value = false;
  }
}

async function toggleTransformedView() {
  currentView.value = 'transformed';
  if (transformedCode.value || isTransforming.value) return;

  const codeToTransform = extractCode();
  if (!codeToTransform) return;

  isTransforming.value = true;
  const engine = getTypePHPEngine(site.value.base || '/docs/');
  try {
    const cleanConfig = JSON.parse(JSON.stringify(localConfig.value));
    const res = await engine.transform(codeToTransform, cleanConfig);
    transformedCode.value = res.transformedCode;
  } catch (err: any) {
    transformedCode.value = `// AST Transformation Error: ${err?.message || err}`;
  } finally {
    isTransforming.value = false;
  }
}

function copyCode() {
  const text = currentView.value === 'source' ? extractCode() : transformedCode.value;
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}

onMounted(() => {
  if (props.defaultView === 'transformed') {
    toggleTransformedView();
  }
});
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  position: relative;
}

/* Header Base (Desktop: 1 Line) */
.snippet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--vp-c-bg-mute);
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
  border-bottom: 1px solid var(--vp-c-divider);
  gap: 8px;
  min-height: 38px;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.title-cluster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.php-icon {
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.snippet-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--vp-font-family-mono);
}

.snippet-config-badges {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.config-badge-pill {
  font-size: 9.5px;
  font-weight: 700;
  color: var(--vp-c-brand-1);
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
  font-family: var(--vp-font-family-mono);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.actions-cluster {
  display: inline-flex;
  align-items: center;
  gap: 6px;
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
  transition: all 0.15s ease;
}

.icon-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.run-snippet-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  height: 24px;
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

/* Snippet Code Body */
.snippet-body {
  position: relative;
  background: var(--vp-code-block-bg, var(--vp-c-bg-soft));
  overflow: hidden;
}

.slot-content :deep(div[class*='language-']),
.vp-doc .typephp-snippet-card div[class*='language-'] {
  margin: 0 !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
}

.slot-content :deep(button.copy) {
  display: none !important;
}

.typephp-snippet-card :deep(span.lang),
.typephp-snippet-card .lang-badge {
  display: none !important;
}

/* Transformed Code Block */
.transformed-block {
  position: relative;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
}

.transform-loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px 16px 48px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

/* Line Numbers Gutter: Fixed 32px width */
.line-numbers-wrapper {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  width: 32px !important;
  text-align: center;
  padding: 18px 0 !important;
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

/* Desktop Code Area */
.snippet-pre {
  margin: 0 !important;
  padding: 18px 20px 18px 52px !important;
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

/* Syntax Token Colors */
:deep(.tok-keyword) { color: var(--snip-keyword) !important; font-weight: normal; }
:deep(.tok-php) { color: var(--snip-keyword) !important; font-weight: normal; }
:deep(.tok-fn) { color: var(--snip-fn) !important; }
:deep(.tok-string) { color: var(--snip-string) !important; }
:deep(.tok-number) { color: var(--snip-number) !important; }
:deep(.tok-type) { color: var(--snip-type) !important; }
:deep(.tok-var) { color: var(--snip-var) !important; }
:deep(.tok-comment) { color: var(--snip-comment) !important; font-style: italic; }
:deep(.tok-tag) { color: var(--snip-tag) !important; font-weight: 600; }

.spinner {
  width: 9px;
  height: 9px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner.dark {
  border-color: rgba(59, 130, 246, 0.2);
  border-top-color: var(--vp-c-brand-1);
}

@keyframes spin { to { transform: rotate(360deg); } }

/* Mobile & Tablet Responsiveness (<= 768px) */
@media (max-width: 768px) {
  .snippet-header {
    flex-direction: column !important;
    align-items: stretch !important;
    padding: 8px 10px !important;
    gap: 8px !important;
    height: auto !important;
  }

  .header-left {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    min-width: 0 !important;
  }

  .title-cluster {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }

  .snippet-title {
    font-size: 12px !important;
    font-weight: 700 !important;
    color: var(--vp-c-text-1) !important;
  }

  .header-right {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
  }

  .actions-cluster {
    gap: 6px !important;
  }

  .line-numbers-wrapper {
    padding: 14px 0 !important;
  }

  .snippet-pre {
    padding: 14px 14px 14px 44px !important;
  }
}
</style>