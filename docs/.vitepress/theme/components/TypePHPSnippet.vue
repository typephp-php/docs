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

        <div v-if="activeConfigBadges.length > 0" class="snippet-config-badges">
          <span v-for="badge in activeConfigBadges" :key="badge" class="config-badge-pill">
            {{ badge }}
          </span>
        </div>
      </div>

      <div class="header-right">
        <!-- 3-Way View Switcher: Source | Edit | Transformed/AST -->
        <div v-if="!hideToggle" class="view-pill-group">
          <button :class="['view-pill-btn', { active: currentView === 'source' }]" @click="currentView = 'source'">
            Source
          </button>
          <button :class="['view-pill-btn', { active: currentView === 'edit' }]" @click="toggleEditView">
            Edit
          </button>
          <button :class="['view-pill-btn', { active: currentView === 'transformed' }]" @click="toggleTransformedView">
            <span class="view-label-desktop">Transformed</span>
            <span class="view-label-mobile">AST</span>
          </button>
        </div>

        <div class="actions-cluster">
          <!-- Reset Modified Code Button -->
          <button
            v-if="isModified"
            class="icon-btn reset-btn"
            title="Reset code to original tutorial snippet"
            @click="resetCode"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>

          <!-- Open in Full-Screen Playground -->
          <button
            class="icon-btn playground-link-btn"
            title="Open in full Playground (new tab)"
            @click="openInPlayground"
          >
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </button>

          <!-- Config Popover -->
          <PlaygroundConfigPopover
            v-model="localConfig"
            :has-custom-config="hasCustomConfig"
            :compact="true"
            @reset="resetToSnippetDefaults"
          />

          <!-- Copy Button -->
          <button class="icon-btn" :title="copied ? 'Copied!' : 'Copy Code'" @click="copyCode">
            <svg v-if="!copied" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10b981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>

          <!-- Run Button -->
          <button class="run-snippet-btn" :disabled="isRunning" @click="runSnippet">
            <span v-if="isRunning" class="spinner"></span>
            <svg v-else viewBox="0 0 24 24" width="11" height="11" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span class="run-text">Run</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Code Block Body -->
    <div class="snippet-body">
      <!-- 1. Source View -->
      <div v-show="currentView === 'source'" class="code-view-pane">
        <div v-if="sourceLineCount > 0" class="line-numbers-wrapper" aria-hidden="true">
          <span v-for="n in sourceLineCount" :key="n" class="line-number">{{ n }}</span>
        </div>

        <pre v-if="highlightedSourceCode" class="snippet-pre"><code v-html="highlightedSourceCode"></code></pre>

        <div v-show="!highlightedSourceCode" ref="slotWrapper" class="slot-content">
          <slot>
            <pre class="snippet-pre"><code>{{ code }}</code></pre>
          </slot>
        </div>

        <div v-if="highlightedSourceCode" ref="slotWrapper" style="display: none;">
          <slot></slot>
        </div>
      </div>

      <!-- 2. Lazy On-Demand Edit View -->
      <div
        v-if="hasMountedEditor"
        v-show="currentView === 'edit'"
        class="snippet-editor-pane"
        :style="{ height: editorHeight }"
      >
        <PlaygroundEditor
          v-model="editableCode"
          :font-size="13"
          @run="runSnippet"
          @update:model-value="onCodeEdited"
        />
      </div>

      <!-- 3. Transformed View -->
      <div v-show="currentView === 'transformed'" class="code-view-pane">
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

    <!-- Output Drawer -->
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
      @run="runSnippet"
      @clear="clearConsole"
      @clear-report="report = null"
      @update:report-view-mode="snippetReportViewMode = $event"
      @close="hasRun = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useData, withBase } from 'vitepress';
import LZString from 'lz-string';
import { getTypePHPEngine, type RunResult } from '../utils/typephp-engine';
import {
  DEFAULT_PLAYGROUND_CONFIG,
  DEFAULT_INLINE_VARS_CONFIG,
  type PlaygroundConfig,
  type InlineVarsConfig,
  type AuditReportDocument
} from '../presets';
import { highlightPhp } from '../utils/docblock-highlighter';
import PlaygroundConfigPopover from './PlaygroundConfigPopover.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';
import PlaygroundEditor from './PlaygroundEditor.vue';

const props = withDefaults(defineProps<{
  code?: string;
  title?: string;
  config?: Partial<PlaygroundConfig>;
  defaultView?: 'source' | 'edit' | 'transformed';
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

const currentView = ref<'source' | 'edit' | 'transformed'>(props.defaultView);
const hasMountedEditor = ref<boolean>(props.defaultView === 'edit');

const initialCode = ref<string>('');
const editableCode = ref<string>('');
const sourceCode = ref<string>('');
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

const isModified = computed(() => {
  return editableCode.value.trim() !== initialCode.value.trim();
});

const editorHeight = computed(() => {
  const lineCount = (editableCode.value || sourceCode.value || '').split('\n').length;
  const targetPx = lineCount * 22 + 40;
  return `${Math.max(180, Math.min(500, targetPx))}px`;
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
  if (!localConfig.value.strictReturnGenericInvariance) badges.push('Pragmatic Returns');
  if (!localConfig.value.eliminateStaticallyProvenChecks) badges.push('No AST Elimination');
  if (localConfig.value.magicPropertyReads) badges.push('Strict __get');
  if (localConfig.value.arrayValidation === 'hybrid') badges.push('Hybrid Array');
  if (localConfig.value.onViolation === 'warn') badges.push('Warn Mode');
  if (localConfig.value.onViolation === 'report') badges.push('Report Mode');
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

function extractCode(): string {
  if (props.code && props.code.trim()) {
    return props.code.trim();
  }
  if (!slotWrapper.value) return '';

  const codeEl = slotWrapper.value.querySelector('pre code') || slotWrapper.value.querySelector('code');
  return (codeEl?.textContent || slotWrapper.value.textContent || '').trim();
}

onMounted(() => {
  const codeText = extractCode();
  initialCode.value = codeText;
  editableCode.value = codeText;
  sourceCode.value = codeText;

  if (props.defaultView === 'transformed') {
    toggleTransformedView();
  }
});

const sourceLineCount = computed(() => {
  if (!sourceCode.value) return 0;
  return sourceCode.value.split('\n').length;
});

const highlightedSourceCode = computed(() => {
  if (!sourceCode.value) return '';
  return highlightPhp(sourceCode.value);
});

const transformedLineCount = computed(() => {
  if (!transformedCode.value) return 0;
  return transformedCode.value.split('\n').length;
});

const highlightedTransformedCode = computed(() => {
  if (!transformedCode.value) return '';
  return highlightPhp(transformedCode.value);
});

function toggleEditView() {
  hasMountedEditor.value = true;
  currentView.value = 'edit';
}

function onCodeEdited(newCode: string) {
  editableCode.value = newCode;
  sourceCode.value = newCode;
  transformedCode.value = '';
}

function resetCode() {
  editableCode.value = initialCode.value;
  sourceCode.value = initialCode.value;
  transformedCode.value = '';
  if (hasRun.value) {
    runSnippet();
  }
}

function getConfigDelta(cfg: PlaygroundConfig): Partial<PlaygroundConfig> | undefined {
  const delta: any = {};
  let hasDiff = false;

  for (const key of Object.keys(DEFAULT_PLAYGROUND_CONFIG) as Array<keyof PlaygroundConfig>) {
    if (key === 'inlineVars') {
      const defIv = DEFAULT_INLINE_VARS_CONFIG;
      const curIv = cfg.inlineVars || defIv;
      const ivDiff: any = {};
      let hasIvDiff = false;

      for (const ivKey of Object.keys(defIv) as Array<keyof InlineVarsConfig>) {
        if (curIv[ivKey] !== defIv[ivKey]) {
          ivDiff[ivKey] = curIv[ivKey];
          hasIvDiff = true;
        }
      }

      if (hasIvDiff) {
        delta.inlineVars = ivDiff;
        hasDiff = true;
      }
    } else if (cfg[key] !== DEFAULT_PLAYGROUND_CONFIG[key]) {
      delta[key] = cfg[key];
      hasDiff = true;
    }
  }

  return hasDiff ? delta : undefined;
}

function openInPlayground() {
  const codeToOpen = editableCode.value || sourceCode.value || extractCode();
  const payload: any = { c: codeToOpen };

  if (props.title && props.title !== 'TypePHP Interactive') {
    payload.t = props.title;
  }

  const delta = getConfigDelta(localConfig.value);
  if (delta) payload.g = delta;

  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = withBase(`/playground#c=${compressed}`);
  window.open(url, '_blank');
}

async function runSnippet() {
  const codeToRun = editableCode.value || sourceCode.value || extractCode();
  if (!codeToRun) return;

  isRunning.value = true;
  hasRun.value = true;
  stdout.value = '';
  stderr.value = '';
  report.value = null;

  const engine = getTypePHPEngine(site.value.base || '/');

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

  const codeToTransform = editableCode.value || sourceCode.value || extractCode();
  if (!codeToTransform) return;

  isTransforming.value = true;
  const engine = getTypePHPEngine(site.value.base || '/');
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
  const text = currentView.value === 'transformed' ? transformedCode.value : (editableCode.value || sourceCode.value);
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2000);
  });
}
</script>

<style scoped>
.typephp-snippet-card {
  margin: 20px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-code-block-bg, var(--vp-c-bg-soft));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
  position: relative;
}

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
  flex-shrink: 0;
}

.view-pill-group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg);
  flex-shrink: 0;
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
  white-space: nowrap;
}

.view-pill-btn.active {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.view-label-desktop {
  display: inline;
}

.view-label-mobile {
  display: none;
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
  flex-shrink: 0;
}

.icon-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.icon-btn.reset-btn {
  color: #f59e0b;
  border-color: rgba(245, 158, 11, 0.3);
  background: rgba(245, 158, 11, 0.08);
}

.icon-btn.reset-btn:hover {
  border-color: #f59e0b;
  color: #d97706;
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
  flex-shrink: 0;
  white-space: nowrap;
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
  overflow: hidden;
}

.snippet-editor-pane {
  width: 100%;
  position: relative;
  overflow: hidden;
}

.code-view-pane {
  position: relative;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
}

.slot-content :deep(div[class*='language-']),
.vp-doc .typephp-snippet-card div[class*='language-'] {
  margin: 0 !important;
  border-radius: 0 !important;
  border: none !important;
  background: transparent !important;
}

.slot-content :deep(button.copy),
.typephp-snippet-card :deep(span.lang),
.typephp-snippet-card .lang-badge {
  display: none !important;
}

.transform-loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 20px 18px 52px;
  font-size: 12px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.line-numbers-wrapper {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 5;
  width: 34px !important;
  text-align: center;
  padding: 18px 0 !important;
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 13px);
  line-height: var(--vp-code-line-height, 1.7);
  color: var(--vp-code-line-number-color, var(--vp-c-text-3));
  border-right: 1px solid var(--vp-c-divider);
  background-color: var(--vp-code-block-bg, var(--vp-c-bg-soft)) !important;
  user-select: none;
  box-sizing: border-box;
}

.line-number {
  display: block;
}

.snippet-pre {
  margin: 0 !important;
  padding: 18px 20px 18px 52px !important;
  background: transparent !important;
  font-family: var(--vp-font-family-mono);
  font-size: var(--vp-code-font-size, 13px);
  line-height: var(--vp-code-line-height, 1.7);
  overflow-x: auto;
  box-sizing: border-box;
  color: var(--vp-c-text-1) !important;
}

.snippet-pre code {
  display: block;
  width: fit-content;
  min-width: 100%;
}

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

/* Tablet & Mobile Responsiveness */
@media (max-width: 768px) {
  .snippet-header {
    flex-direction: column !important;
    align-items: stretch !important;
    padding: 7px 10px !important;
    gap: 6px !important;
    height: auto !important;
  }

  .header-left {
    width: 100% !important;
    justify-content: space-between !important;
  }

  .header-right {
    width: 100% !important;
    justify-content: space-between !important;
    gap: 6px !important;
  }

  .line-numbers-wrapper {
    padding: 14px 0 !important;
  }

  .snippet-pre {
    padding: 14px 14px 14px 44px !important;
  }
}

@media (max-width: 560px) {
  .view-label-desktop {
    display: none !important;
  }

  .view-label-mobile {
    display: inline !important;
  }

  .snippet-header {
    padding: 6px 8px !important;
  }

  .view-pill-btn {
    padding: 2px 5px !important;
    font-size: 9.5px !important;
  }

  .actions-cluster {
    gap: 4px !important;
  }

  .icon-btn {
    width: 22px !important;
    height: 22px !important;
  }

  .icon-btn svg {
    width: 11px !important;
    height: 11px !important;
  }

  .run-snippet-btn {
    height: 22px !important;
    padding: 0 7px !important;
    font-size: 10.5px !important;
  }

  .actions-cluster :deep(.config-trigger-btn.compact) {
    width: 22px !important;
    height: 22px !important;
  }

  .actions-cluster :deep(.config-trigger-btn.compact svg) {
    width: 11px !important;
    height: 11px !important;
  }
}

@media (max-width: 380px) {
  .snippet-title {
    max-width: 160px !important;
    font-size: 11px !important;
  }

  .line-numbers-wrapper {
    width: 28px !important;
  }

  .snippet-pre {
    padding: 12px 10px 12px 36px !important;
  }
}
</style>