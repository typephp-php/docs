<template>
  <div class="playground-root" :style="{ '--playground-font-size': `${fontSize}px` }">
    <header class="playground-toolbar">
      <div class="toolbar-left">
        <select v-model="selectedPresetId" class="preset-select" @change="onSelectPreset">
          <option v-for="preset in presets" :key="preset.id" :value="preset.id">
            [{{ preset.badge }}] {{ preset.name }}
          </option>
        </select>
      </div>

      <div class="toolbar-center">
        <button class="run-btn" :disabled="!isReady || isRunning" @click="runCode">
          <svg class="play-icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          {{ isRunning ? 'Running...' : 'Run Code' }}
          <span class="key-hint">Ctrl+Enter</span>
        </button>

        <div class="view-mode-toggle">
          <button :class="['mode-btn', { active: viewMode === 'source' }]" @click="viewMode = 'source'">
            Source Code
          </button>
          <button :class="['mode-btn', { active: viewMode === 'xray' }]"
            title="Inspect TypePHP AST injected checks in-place with zero line-drift" @click="viewMode = 'xray'">
            X-Ray View
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <div class="font-zoom-widget" title="Adjust code and terminal text size">
          <button class="zoom-btn" :disabled="fontSize <= 11" title="Decrease font size" @click="adjustFontSize(-1)">
            A-
          </button>
          <span class="font-size-label">{{ fontSize }}px</span>
          <button class="zoom-btn" :disabled="fontSize >= 20" title="Increase font size" @click="adjustFontSize(1)">
            A+
          </button>
        </div>

        <button class="action-btn" title="Copy Editor Code" @click="copyEditorCode">
          {{ copiedCode ? 'Copied Code!' : 'Copy Code' }}
        </button>

        <button class="action-btn" title="Share Snippet URL" @click="shareSnippet">
          {{ copiedLink ? 'Copied Link!' : 'Share' }}
        </button>

        <span class="engine-badge" :title="workerStatus">
          <span :class="['status-dot', { active: isReady, loading: !isReady && !initError, error: initError }]"></span>
          PHP 8.5 WASM
        </span>
      </div>
    </header>

    <main class="playground-workspace">
      <div class="editor-pane">
        <PlaygroundEditor :model-value="viewMode === 'source' ? code : transformedCode" :read-only="viewMode === 'xray'"
          :font-size="fontSize" @update:model-value="onCodeUpdate" @run="runCode" />
      </div>

      <PlaygroundOutput ref="outputDrawerRef" :stdout="stdout" :stderr="stderr" :exit-code="exitCode"
        :duration="duration" :status-message="workerStatus" :is-running="isRunning" @clear="clearConsole" />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useData } from 'vitepress';
import LZString from 'lz-string';
import { PLAYGROUND_PRESETS } from '../presets';
import PlaygroundEditor from './PlaygroundEditor.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const presets = PLAYGROUND_PRESETS;
const selectedPresetId = ref<string>(presets[0].id);
const code = ref<string>(presets[0].code);

const viewMode = ref<'source' | 'xray'>('source');
const outputDrawerRef = ref<InstanceType<typeof PlaygroundOutput> | null>(null);

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

const copiedLink = ref<boolean>(false);
const copiedCode = ref<boolean>(false);

const { site } = useData();
let worker: Worker | null = null;

onMounted(() => {
  try {
    const savedSize = localStorage.getItem('typephp_playground_fontsize');
    if (savedSize) {
      const parsed = parseFloat(savedSize);
      if (parsed >= 11 && parsed <= 20) {
        fontSize.value = parsed;
      }
    }
  } catch { }

  const hash = window.location.hash;
  if (hash.startsWith('#code=')) {
    try {
      const compressed = hash.substring(6);
      const decompressed = LZString.decompressFromEncodedURIComponent(compressed);
      if (decompressed) {
        code.value = decompressed;
      }
    } catch (e) {
      console.error('[Playground] Failed to decompress URL hash:', e);
    }
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

function adjustFontSize(delta: number) {
  const newSize = Math.max(11, Math.min(20, fontSize.value + delta));
  fontSize.value = newSize;
  try {
    localStorage.setItem('typephp_playground_fontsize', newSize.toString());
  } catch { }
}

function onCodeUpdate(newCode: string) {
  code.value = newCode;
  triggerTransform();
}

function onSelectPreset() {
  const matched = presets.find((p) => p.id === selectedPresetId.value);
  if (matched) {
    code.value = matched.code;
    viewMode.value = 'source';
    clearConsole();
    triggerTransform();
  }
}

function runCode() {
  const activeWorker = worker;
  if (!activeWorker || !isReady.value || isRunning.value) return;

  isRunning.value = true;
  clearConsole();
  
  outputDrawerRef.value?.expand();

  activeWorker.postMessage({ action: 'RUN', code: code.value });
  triggerTransform();
}

function triggerTransform() {
  const activeWorker = worker;
  if (activeWorker && isReady.value) {
    activeWorker.postMessage({ action: 'TRANSFORM', code: code.value });
  }
}

function clearConsole() {
  stdout.value = '';
  stderr.value = '';
  exitCode.value = null;
  duration.value = '';
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
  const compressed = LZString.compressToEncodedURIComponent(code.value);
  const shareUrl = `${window.location.origin}${window.location.pathname}#code=${compressed}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    copiedLink.value = true;
    setTimeout(() => {
      copiedLink.value = false;
    }, 2000);
  });
}

onUnmounted(() => {
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

.playground-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  background-color: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  gap: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select {
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  outline: none;
}

.preset-select:hover {
  border-color: var(--vp-c-brand-1);
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 14px;
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 600;
  background-color: var(--vp-c-brand-1);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.run-btn:hover:not(:disabled) {
  background-color: var(--vp-c-brand-2);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-hint {
  font-size: 10.5px;
  padding: 1px 5px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  opacity: 0.85;
}

.view-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.mode-btn {
  padding: 5px 12px;
  font-size: 12.5px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn:hover {
  color: var(--vp-c-text-1);
}

.mode-btn.active {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* Font Zoom Widget (A- / A+) */
.font-zoom-widget {
  display: inline-flex;
  align-items: center;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

.zoom-btn {
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  background: transparent;
  border: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.zoom-btn:hover:not(:disabled) {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.zoom-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.font-size-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding: 0 4px;
  font-family: var(--vp-font-family-mono);
  user-select: none;
}

.action-btn {
  padding: 4px 10px;
  font-size: 12.5px;
  font-weight: 600;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.engine-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  padding: 3px 8px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
}

.status-dot.active {
  background: #10b981;
}

.status-dot.loading {
  background: #f59e0b;
  animation: pulse 1s infinite;
}

.status-dot.error {
  background: #ef4444;
}

.playground-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  height: calc(100% - 49px);
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  min-height: 0;
  width: 100%;
}

@media (max-width: 960px) {

  .key-hint,
  .collapse-hint {
    display: none;
  }
}
</style>