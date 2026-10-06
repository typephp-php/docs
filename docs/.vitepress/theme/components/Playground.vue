<template>
  <div
    class="playground-root"
    :style="{ '--playground-font-size': `${fontSize}px` }"
  >
    <!-- Top Action Toolbar Partial -->
    <PlaygroundToolbar
      :presets="presets"
      :selected-preset-id="selectedPresetId"
      :snippet-title="snippetTitle"
      :view-mode="viewMode"
      :font-size="fontSize"
      :is-ready="isReady"
      :is-running="isRunning"
      :init-error="initError"
      :worker-status="workerStatus"
      :config="config"
      :has-custom-config="hasCustomConfig"
      :copied-code="copiedCode"
      :copied-link="copiedLink"
      @select-preset="onSelectPreset"
      @update:snippet-title="onTitleUpdate"
      @run="runCode"
      @update:view-mode="viewMode = $event"
      @adjust-font-size="adjustFontSize"
      @copy-code="copyEditorCode"
      @format="formatCode"
      @share="shareSnippet"
      @update:config="config = $event"
      @reset-config="resetConfig"
    />

    <!-- Main Workspace -->
    <main :class="['playground-workspace', `layout-${effectivePosition}`]">
      <div class="editor-pane">
        <!-- Editor Loading Overlay Partial -->
        <PlaygroundLoadingOverlay
          :is-ready="isReady"
          :init-error="initError"
          :status="workerStatus"
        />

        <PlaygroundEditor
          ref="editorRef"
          :model-value="viewMode === 'source' ? code : transformedCode"
          :read-only="viewMode === 'xray'"
          :font-size="fontSize"
          @update:model-value="onCodeUpdate"
          @run="runCode"
        />
      </div>

      <!-- Output Console & Audit Report Partial -->
      <PlaygroundOutput
        ref="outputDrawerRef"
        :position="effectivePosition"
        :stdout="stdout"
        :stderr="stderr"
        :exit-code="exitCode"
        :duration="duration"
        :status-message="workerStatus"
        :is-running="isRunning"
        :report="report"
        :is-report-mode-active="config.onViolation === 'report'"
        :report-view-mode="reportViewMode"
        @clear="clearConsole"
        @clear-report="clearReport"
        @update:report-view-mode="onReportViewModeUpdate"
        @toggle-position="toggleLayoutPosition"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useData } from 'vitepress';
import LZString from 'lz-string';
import {
  PLAYGROUND_PRESETS,
  DEFAULT_PLAYGROUND_CONFIG,
  DEFAULT_INLINE_VARS_CONFIG,
  type PlaygroundConfig,
  type AuditReportDocument
} from '../presets';
import PlaygroundToolbar from './PlaygroundToolbar.vue';
import PlaygroundLoadingOverlay from './PlaygroundLoadingOverlay.vue';
import PlaygroundEditor from './PlaygroundEditor.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const DRAFT_CODE_KEY = 'typephp_playground_draft_code';
const DRAFT_TITLE_KEY = 'typephp_playground_draft_title';
const DRAFT_PRESET_KEY = 'typephp_playground_draft_preset';
const DRAFT_REPORT_VIEW_KEY = 'typephp_playground_report_view_mode';

const presets = PLAYGROUND_PRESETS;
const selectedPresetId = ref<string>(presets[0]?.id ?? '');
const snippetTitle = ref<string>(presets[0]?.name ?? 'Runtime Reified Generics');
const code = ref<string>(presets[0]?.code ?? '<?php\n');

const viewMode = ref<'source' | 'xray'>('source');
const reportViewMode = ref<'cards' | 'json'>('cards');
const layoutPosition = ref<'bottom' | 'side'>('side');
const windowWidth = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);

const outputDrawerRef = ref<InstanceType<typeof PlaygroundOutput> | null>(null);
const editorRef = ref<InstanceType<typeof PlaygroundEditor> | null>(null);

const fontSize = ref<number>(13.5);

const isReady = ref<boolean>(false);
const isRunning = ref<boolean>(false);
const initError = ref<boolean>(false);
const workerStatus = ref<string>('Initializing PHP 8.5 WebAssembly...');

const stdout = ref<string>('');
const stderr = ref<string>('');
const exitCode = ref<number | null>(null);
const duration = ref<string>('');
const transformedCode = ref<string>('');
const report = ref<AuditReportDocument | null>(null);

const copiedLink = ref<boolean>(false);
const copiedCode = ref<boolean>(false);

const config = ref<PlaygroundConfig>({
  ...DEFAULT_PLAYGROUND_CONFIG,
  inlineVars: { ...DEFAULT_INLINE_VARS_CONFIG }
});

const hasCustomConfig = computed<boolean>(() => {
  const iv = config.value.inlineVars || DEFAULT_INLINE_VARS_CONFIG;
  const isInlineVarsCustom =
    iv.properties !== DEFAULT_INLINE_VARS_CONFIG.properties ||
    iv.generics !== DEFAULT_INLINE_VARS_CONFIG.generics ||
    iv.callables !== DEFAULT_INLINE_VARS_CONFIG.callables ||
    iv.scalars !== DEFAULT_INLINE_VARS_CONFIG.scalars ||
    iv.arrays !== DEFAULT_INLINE_VARS_CONFIG.arrays ||
    iv.objects !== DEFAULT_INLINE_VARS_CONFIG.objects;

  return (
    config.value.enabled !== DEFAULT_PLAYGROUND_CONFIG.enabled ||
    config.value.onViolation !== DEFAULT_PLAYGROUND_CONFIG.onViolation ||
    config.value.redactValues !== DEFAULT_PLAYGROUND_CONFIG.redactValues ||
    config.value.ignoreTraceDepth !== DEFAULT_PLAYGROUND_CONFIG.ignoreTraceDepth ||
    config.value.arrayValidation !== DEFAULT_PLAYGROUND_CONFIG.arrayValidation ||
    config.value.strictReturnGenericInvariance !== DEFAULT_PLAYGROUND_CONFIG.strictReturnGenericInvariance ||
    config.value.respectNativeNullability !== DEFAULT_PLAYGROUND_CONFIG.respectNativeNullability ||
    config.value.respectIgnoreTags !== DEFAULT_PLAYGROUND_CONFIG.respectIgnoreTags ||
    config.value.magicPropertyReads !== DEFAULT_PLAYGROUND_CONFIG.magicPropertyReads ||
    isInlineVarsCustom
  );
});

const { site } = useData();
let worker: Worker | null = null;
let saveDraftTimer: ReturnType<typeof setTimeout> | null = null;
let lastRunTimestamp = 0;

const effectivePosition = computed<'bottom' | 'side'>(() => {
  return windowWidth.value < 960 ? 'bottom' : layoutPosition.value;
});

function handleWindowResize() {
  windowWidth.value = window.innerWidth;
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    runCode();
  }
}

function persistDraft() {
  if (saveDraftTimer) clearTimeout(saveDraftTimer);
  saveDraftTimer = setTimeout(() => {
    try {
      localStorage.setItem(DRAFT_CODE_KEY, code.value);
      localStorage.setItem(DRAFT_TITLE_KEY, snippetTitle.value);
      localStorage.setItem(DRAFT_PRESET_KEY, selectedPresetId.value);
    } catch {}
  }, 350);
}

function onReportViewModeUpdate(mode: 'cards' | 'json') {
  reportViewMode.value = mode;
  try {
    localStorage.setItem(DRAFT_REPORT_VIEW_KEY, mode);
  } catch {}
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('keydown', handleGlobalKeyDown);

  try {
    const savedSize = localStorage.getItem('typephp_playground_fontsize');
    if (savedSize) {
      const parsed = parseFloat(savedSize);
      if (parsed >= 11 && parsed <= 20) {
        fontSize.value = parsed;
      }
    }

    const savedPos = localStorage.getItem('typephp_playground_dock');
    if (savedPos === 'side' || savedPos === 'bottom') {
      layoutPosition.value = savedPos;
    } else {
      layoutPosition.value = 'side';
    }

    const savedConfig = localStorage.getItem('typephp_playground_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed && typeof parsed === 'object') {
        config.value = {
          ...DEFAULT_PLAYGROUND_CONFIG,
          ...parsed,
          inlineVars: {
            ...DEFAULT_INLINE_VARS_CONFIG,
            ...(parsed.inlineVars || {})
          }
        };
      }
    }

    const savedReportView = localStorage.getItem(DRAFT_REPORT_VIEW_KEY);
    if (savedReportView === 'cards' || savedReportView === 'json') {
      reportViewMode.value = savedReportView;
    }
  } catch {}

  let restoredFromHash = false;
  const hash = window.location.hash;

  if (hash.startsWith('#code=')) {
    try {
      const compressed = hash.substring(6);
      const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
      if (decompressed) {
        try {
          const parsed = JSON.parse(decompressed);
          if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
            code.value = parsed.code;
            if (typeof parsed.title === 'string' && parsed.title.trim()) {
              snippetTitle.value = parsed.title;
            }
            if (parsed.reportViewMode === 'cards' || parsed.reportViewMode === 'json') {
              reportViewMode.value = parsed.reportViewMode;
            }
            if (parsed.config) {
              config.value = {
                ...DEFAULT_PLAYGROUND_CONFIG,
                ...parsed.config,
                inlineVars: {
                  ...DEFAULT_INLINE_VARS_CONFIG,
                  ...(parsed.config.inlineVars || {})
                }
              };
            }
            selectedPresetId.value = 'custom';
            restoredFromHash = true;
          } else {
            code.value = decompressed;
            selectedPresetId.value = 'custom';
            restoredFromHash = true;
          }
        } catch {
          code.value = decompressed;
          selectedPresetId.value = 'custom';
          restoredFromHash = true;
        }
      }
    } catch (e) {
      console.error('[Playground] Failed to decompress URL hash:', e);
    }
  }

  // 2. If no hash, restore from persistent localStorage draft
  if (!restoredFromHash) {
    try {
      const savedDraftCode = localStorage.getItem(DRAFT_CODE_KEY);
      if (savedDraftCode && savedDraftCode.trim()) {
        code.value = savedDraftCode;
        snippetTitle.value = localStorage.getItem(DRAFT_TITLE_KEY) || snippetTitle.value;
        selectedPresetId.value = localStorage.getItem(DRAFT_PRESET_KEY) || 'custom';
      }
    } catch {}
  }

  try {
    const activeWorker = new Worker(
      new URL('../workers/playground.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker = activeWorker;

    activeWorker.onerror = (err) => {
      const errorEvent = err as ErrorEvent;
      const errorMsg = errorEvent.message || (err as any)?.error?.message || 'Worker thread failed to execute';
      console.error('[Playground Worker Error]', errorMsg, errorEvent.filename, errorEvent.lineno);
      initError.value = true;
      workerStatus.value = `Worker Error: ${errorMsg}`;
      stderr.value = `Worker Error: ${errorMsg}\nLocation: ${errorEvent.filename || 'playground.worker.ts'}:${errorEvent.lineno || 0}\n\nCheck browser DevTools (F12) Console for details.`;
    };

    activeWorker.onmessage = (event: MessageEvent) => {
      const data = event.data;

      switch (data.type) {
        case 'STATUS':
          workerStatus.value = data.message;
          break;

        case 'READY':
          isReady.value = true;
          workerStatus.value = `Ready (${data.version})`;
          triggerTransform();
          runCode();
          break;

        case 'INIT_ERROR':
          initError.value = true;
          workerStatus.value = `Init Failed: ${data.error}`;
          stderr.value = `Engine Initialization Error: ${data.error}`;
          break;

        case 'RUN_RESULT':
          isRunning.value = false;
          stdout.value = data.stdout;
          stderr.value = data.stderr;
          exitCode.value = data.exitCode;
          duration.value = data.duration;
          report.value = data.report || null;
          break;

        case 'REPORT_CLEARED':
          report.value = null;
          break;

        case 'TRANSFORM_RESULT':
          transformedCode.value = data.transformedCode;
          break;
      }
    };

    const base = site.value.base || '/docs/';
    const absoluteBase = new URL(base, window.location.origin).href;

    activeWorker.postMessage({ action: 'INIT', baseUrl: absoluteBase });
  } catch (err: any) {
    initError.value = true;
    workerStatus.value = `Failed to spawn worker: ${err?.message || err}`;
    stderr.value = `Worker Initialization Error: ${err?.message || err}`;
  }
});

watch(config, (newConf) => {
  try {
    localStorage.setItem('typephp_playground_config', JSON.stringify(newConf));
  } catch {}
  triggerTransform();
}, { deep: true });

function resetConfig() {
  config.value = {
    ...DEFAULT_PLAYGROUND_CONFIG,
    inlineVars: { ...DEFAULT_INLINE_VARS_CONFIG }
  };
}

function toggleLayoutPosition() {
  const newPos = layoutPosition.value === 'bottom' ? 'side' : 'bottom';
  layoutPosition.value = newPos;
  try {
    localStorage.setItem('typephp_playground_dock', newPos);
  } catch {}
}

function adjustFontSize(delta: number) {
  const newSize = Math.max(11, Math.min(20, fontSize.value + delta));
  fontSize.value = newSize;
  try {
    localStorage.setItem('typephp_playground_fontsize', newSize.toString());
  } catch {}
}

function formatCode() {
  (editorRef.value as any)?.autoIndent?.();
}

function onCodeUpdate(newCode: string) {
  code.value = newCode;
  
  const matched = presets.find((p) => p.id === selectedPresetId.value);
  if (matched && matched.code !== newCode) {
    selectedPresetId.value = 'custom';
  }
  
  persistDraft();
  triggerTransform();
}

function onTitleUpdate(newTitle: string) {
  snippetTitle.value = newTitle;
  persistDraft();
}

function onSelectPreset(presetId: string) {
  selectedPresetId.value = presetId;
  const matched = presets.find((p) => p.id === presetId);
  if (matched) {
    code.value = matched.code;
    snippetTitle.value = matched.name;
    if (matched.config) {
      config.value = {
        ...DEFAULT_PLAYGROUND_CONFIG,
        ...matched.config,
        inlineVars: {
          ...DEFAULT_INLINE_VARS_CONFIG,
          ...(matched.config.inlineVars || {})
        }
      };
    }
    viewMode.value = 'source';
    
    // Clear URL hash when switching to an official preset
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    
    persistDraft();
    clearConsole();
    report.value = null;
    triggerTransform();
    runCode();
  }
}

function runCode() {
  const now = performance.now();
  if (now - lastRunTimestamp < 150) return;
  lastRunTimestamp = now;

  const activeWorker = worker;
  if (!activeWorker || !isReady.value || isRunning.value) return;

  isRunning.value = true;
  clearConsole();
  report.value = null;

  outputDrawerRef.value?.expand();

  activeWorker.postMessage({
    action: 'RUN',
    code: code.value,
    config: JSON.parse(JSON.stringify(config.value))
  });
  triggerTransform();
}

function triggerTransform() {
  const activeWorker = worker;
  if (activeWorker && isReady.value) {
    activeWorker.postMessage({
      action: 'TRANSFORM',
      code: code.value,
      config: JSON.parse(JSON.stringify(config.value))
    });
  }
}

function clearConsole() {
  stdout.value = '';
  stderr.value = '';
  exitCode.value = null;
  duration.value = '';
}

function clearReport() {
  report.value = null;
  worker?.postMessage({ action: 'CLEAR_REPORT' });
}

function copyEditorCode() {
  const textToCopy = viewMode.value === 'source' ? code.value : transformedCode.value;
  navigator.clipboard.writeText(textToCopy).then(() => {
    copiedCode.value = true;
    setTimeout(() => {
      copiedCode.value = false;
    }, 2000);
  });
}

function shareSnippet() {
  const payload = {
    title: snippetTitle.value || 'Custom Snippet',
    code: code.value,
    config: config.value,
    reportViewMode: reportViewMode.value, // Persist Cards vs JSON subview in share link
  };
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const shareUrl = `${window.location.origin}${window.location.pathname}#code=${compressed}`;
  
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', shareUrl);
  }

  navigator.clipboard.writeText(shareUrl).then(() => {
    copiedLink.value = true;
    setTimeout(() => {
      copiedLink.value = false;
    }, 2000);
  });
}

onUnmounted(() => {
  if (saveDraftTimer) clearTimeout(saveDraftTimer);
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener('keydown', handleGlobalKeyDown);
  }
  if (worker) {
    worker.terminate();
    worker = null;
  }
});
</script>

<style scoped>
.playground-root {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--vp-nav-height) - 1px);
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  margin-right: calc(-50vw + 50%);
  overflow: hidden;
  background-color: var(--vp-c-bg);
}

.playground-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.playground-workspace.layout-bottom {
  flex-direction: column;
}

.playground-workspace.layout-bottom .editor-pane {
  flex: 1;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.playground-workspace.layout-side {
  flex-direction: row;
}

.playground-workspace.layout-side .editor-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
  position: relative;
  overflow: hidden;
}

@media (max-width: 960px) {
  .playground-workspace {
    flex-direction: column !important;
  }

  .editor-pane {
    height: 55% !important;
    width: 100% !important;
  }
}
</style>