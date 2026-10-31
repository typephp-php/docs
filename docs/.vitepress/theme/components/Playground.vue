<template>
  <div class="playground-root" :style="{ '--playground-font-size': `${fontSize}px` }">
    <PlaygroundToolbar :presets="presets" :selected-preset-id="selectedPresetId" :snippet-title="snippetTitle"
      :view-mode="viewMode" :font-size="fontSize" :is-ready="isReady" :is-running="isRunning" :init-error="initError"
      :worker-status="workerStatus" :config="config" :has-custom-config="hasCustomConfig" :copied-code="copiedCode"
      :copied-link="copiedLink" :is-sharing="isSharing" @select-preset="onSelectPreset"
      @update:snippet-title="onTitleUpdate" @run="runCode" @update:view-mode="viewMode = $event"
      @adjust-font-size="adjustFontSize" @copy-code="copyEditorCode" @format="formatCode" @share="shareSnippet"
      @update:config="config = $event" @reset-config="resetConfig" />

    <main :class="['playground-workspace', `layout-${effectivePosition}`]">
      <div class="editor-pane">
        <PlaygroundLoadingOverlay :is-ready="isReady" :init-error="initError" :status="workerStatus" />

        <PlaygroundEditor ref="editorRef" :model-value="viewMode === 'source' ? code : transformedCode"
          :read-only="viewMode === 'xray'" :font-size="fontSize" @update:model-value="onCodeUpdate" @run="runCode" />
      </div>

      <PlaygroundOutput ref="outputDrawerRef" :position="effectivePosition" :stdout="stdout" :stderr="stderr"
        :exit-code="exitCode" :duration="duration" :status-message="workerStatus" :is-running="isRunning"
        :report="report" :is-report-mode-active="config.onViolation === 'report'" :report-view-mode="reportViewMode"
        @clear="clearConsole" @clear-report="clearReport" @update:report-view-mode="onReportViewModeUpdate"
        @toggle-position="toggleLayoutPosition" />
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
  type InlineVarsConfig,
  type AuditReportDocument,
} from '../presets';
import PlaygroundToolbar from './PlaygroundToolbar.vue';
import PlaygroundLoadingOverlay from './PlaygroundLoadingOverlay.vue';
import PlaygroundEditor from './PlaygroundEditor.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const isSharing = ref<boolean>(false);
const rawBaseUrl =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://ymwxequwisttbyfjojvw.supabase.co';
const cleanBaseUrl = rawBaseUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/$/, '');

const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'sb_publishable_VvLekZu1GqzSLXdrVzn8uA_syEEB3CM';

const SUPABASE_ENDPOINT = `${cleanBaseUrl}/rest/v1/snippets`;

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
    config.value.eliminateStaticallyProvenChecks !== DEFAULT_PLAYGROUND_CONFIG.eliminateStaticallyProvenChecks ||
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
    } catch { }
  }, 350);
}

function onReportViewModeUpdate(mode: 'cards' | 'json') {
  reportViewMode.value = mode;
  try {
    localStorage.setItem(DRAFT_REPORT_VIEW_KEY, mode);
  } catch { }
}

// Delta Encoding: extracts ONLY non-default settings
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

function applyConfigDelta(delta?: Partial<PlaygroundConfig>): PlaygroundConfig {
  if (!delta || typeof delta !== 'object') {
    return {
      ...DEFAULT_PLAYGROUND_CONFIG,
      inlineVars: { ...DEFAULT_INLINE_VARS_CONFIG },
    };
  }

  return {
    ...DEFAULT_PLAYGROUND_CONFIG,
    ...delta,
    inlineVars: {
      ...DEFAULT_INLINE_VARS_CONFIG,
      ...(delta.inlineVars || {}),
    },
  };
}

onMounted(async () => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.add('playground-active');
  }

  window.addEventListener('resize', handleWindowResize);
  window.addEventListener('keydown', handleGlobalKeyDown);

  // 1. Restore local preferences
  try {
    const savedSize = localStorage.getItem('typephp_playground_fontsize');
    if (savedSize) {
      const parsed = parseFloat(savedSize);
      if (parsed >= 11 && parsed <= 20) fontSize.value = parsed;
    }

    const savedPos = localStorage.getItem('typephp_playground_dock');
    if (savedPos === 'side' || savedPos === 'bottom') layoutPosition.value = savedPos;

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
  } catch { }

  let restoredFromHash = false;
  const hash = window.location.hash;

  if (hash.startsWith('#r=')) {
    const snippetId = hash.substring(3).trim();
    if (snippetId) {
      try {
        workerStatus.value = `Loading snippet #${snippetId}...`;
        const res = await fetch(`${SUPABASE_ENDPOINT}?id=eq.${encodeURIComponent(snippetId)}&select=*`, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
          },
        });

        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
            const data = items[0];
            if (typeof data.code === 'string') {
              code.value = data.code;
              if (data.title && typeof data.title === 'string') {
                snippetTitle.value = data.title;
              }
              if (data.report_view_mode === 'cards' || data.report_view_mode === 'json') {
                reportViewMode.value = data.report_view_mode;
              }
              config.value = applyConfigDelta(data.config);
              selectedPresetId.value = 'custom';
              restoredFromHash = true;
            }
          }
        } else {
          console.error('[Supabase GET Error]', res.status, await res.text());
        }
      } catch (err) {
        console.error('[Playground] Failed to load snippet from Supabase:', err);
      }
    }
  }

  else if (hash.startsWith('#p=') || hash.startsWith('#preset=')) {
    const presetId = decodeURIComponent(hash.startsWith('#p=') ? hash.substring(3) : hash.substring(8));
    const matched = presets.find((p) => p.id === presetId);
    if (matched) {
      onSelectPreset(matched.id);
      restoredFromHash = true;
    }
  }

  else if (hash.startsWith('#c=') || hash.startsWith('#code=')) {
    const isLegacy = hash.startsWith('#code=');
    const rawCompressed = hash.substring(isLegacy ? 6 : 3);

    try {
      const decompressed = LZString.decompressFromEncodedURIComponent(rawCompressed);
      if (decompressed) {
        try {
          const parsed = JSON.parse(decompressed);

          if (parsed && typeof parsed === 'object' && typeof parsed.c === 'string') {
            code.value = parsed.c;
            if (typeof parsed.t === 'string') snippetTitle.value = parsed.t;
            if (parsed.r === 'j') reportViewMode.value = 'json';
            config.value = applyConfigDelta(parsed.g);
            selectedPresetId.value = 'custom';
            restoredFromHash = true;
          }
          else if (parsed && typeof parsed === 'object' && typeof parsed.code === 'string') {
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

  if (!restoredFromHash) {
    try {
      const savedDraftCode = localStorage.getItem(DRAFT_CODE_KEY);
      if (savedDraftCode && savedDraftCode.trim()) {
        code.value = savedDraftCode;
        snippetTitle.value = localStorage.getItem(DRAFT_TITLE_KEY) || snippetTitle.value;
        selectedPresetId.value = localStorage.getItem(DRAFT_PRESET_KEY) || 'custom';
      }
    } catch { }
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
  } catch { }
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
  } catch { }
}

function adjustFontSize(delta: number) {
  const newSize = Math.max(11, Math.min(20, fontSize.value + delta));
  fontSize.value = newSize;
  try {
    localStorage.setItem('typephp_playground_fontsize', newSize.toString());
  } catch { }
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
  if (now - lastRunTimestamp < 250 || isRunning.value || !isReady.value) return; 
  lastRunTimestamp = now;

  const activeWorker = worker;
  if (!activeWorker) return;

  isRunning.value = true;
  
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

// Compact Offline Client Hash Fallback (#c=...)
function generateClientHashUrl(): string {
  const baseUrl = `${window.location.origin}${window.location.pathname}`;

  const compactPayload: any = { c: code.value };
  const trimmedTitle = snippetTitle.value?.trim();
  if (trimmedTitle && trimmedTitle !== 'Custom Snippet' && trimmedTitle !== 'Untitled Snippet') {
    compactPayload.t = trimmedTitle;
  }

  const delta = getConfigDelta(config.value);
  if (delta) compactPayload.g = delta;
  if (reportViewMode.value === 'json') compactPayload.r = 'j';

  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(compactPayload));
  return `${baseUrl}#c=${compressed}`;
}

function copyUrlToClipboard(url: string) {
  if (window.history && window.history.replaceState) {
    window.history.replaceState(null, '', url);
  }

  navigator.clipboard.writeText(url).then(() => {
    copiedLink.value = true;
    setTimeout(() => {
      copiedLink.value = false;
    }, 2000);
  });
}

async function shareSnippet() {
  if (isSharing.value) return;
  isSharing.value = true;

  try {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;

    if (selectedPresetId.value && selectedPresetId.value !== 'custom') {
      const matched = presets.find((p) => p.id === selectedPresetId.value);
      if (matched && matched.code.trim() === code.value.trim()) {
        const configDelta = getConfigDelta(config.value);
        if (!configDelta) {
          copyUrlToClipboard(`${baseUrl}#p=${encodeURIComponent(selectedPresetId.value)}`);
          return;
        }
      }
    }

    try {
      const res = await fetch(SUPABASE_ENDPOINT, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          code: code.value,
          title: snippetTitle.value || '',
          config: getConfigDelta(config.value) || {},
          report_view_mode: reportViewMode.value,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data[0]?.id) {
          copyUrlToClipboard(`${baseUrl}#r=${data[0].id}`);
          return;
        }
      } else {
        console.error('[Supabase POST Error]', res.status, await res.text());
      }
    } catch (err) {
      console.error('[Playground] Supabase error, falling back to client hash:', err);
    }

    copyUrlToClipboard(generateClientHashUrl());
  } finally {
    isSharing.value = false;
  }
}
onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.remove('playground-active');
  }

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
  position: fixed;
  top: var(--vp-nav-height, 64px);
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw !important;
  max-width: 100vw !important;
  height: calc(100vh - var(--vp-nav-height, 64px)) !important;
  height: calc(100dvh - var(--vp-nav-height, 64px)) !important;
  margin: 0 !important;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--vp-c-bg);
  z-index: 10;
}

.playground-workspace {
  display: flex;
  flex: 1;
  min-height: 0;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.editor-pane {
  flex: 1 1 0%;
  min-width: 0;
  min-height: 0;
  position: relative;
  overflow: hidden;
}

.playground-workspace.layout-bottom {
  flex-direction: column;
}

.playground-workspace.layout-bottom .editor-pane {
  width: 100%;
  height: 0;
}

.playground-workspace.layout-side {
  flex-direction: row;
}

.playground-workspace.layout-side .editor-pane {
  height: 100%;
  width: 0;
}

@media (max-width: 960px) {
  .playground-workspace {
    flex-direction: column !important;
  }

  .editor-pane {
    flex: 1 1 0% !important;
    height: 0 !important;
    min-height: 100px !important;
    width: 100% !important;
  }

  .playground-workspace :deep(.drawer-container.pos-bottom.collapsed) {
    height: 38px !important;
    min-height: 38px !important;
    max-height: 38px !important;
  }
}
</style>