<template>
  <div class="playground-root">
    <!-- Top Action Toolbar -->
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
      </div>

      <div class="toolbar-right">
        <span class="engine-badge" :title="workerStatus">
          <span :class="['status-dot', { active: isReady, loading: !isReady && !initError, error: initError }]"></span>
          PHP 8.5 WASM
        </span>

        <button class="action-btn" title="Share Snippet URL" @click="shareSnippet">
          {{ copied ? 'Copied Link!' : 'Share' }}
        </button>
      </div>
    </header>

    <!-- Main Split-Screen Workspace -->
    <main class="playground-workspace">
      <div class="editor-pane">
        <PlaygroundEditor v-model="code" @run="runCode" />
      </div>

      <div class="output-pane">
        <PlaygroundOutput :stdout="stdout" :stderr="stderr" :exit-code="exitCode" :duration="duration"
          :transformed-code="transformedCode" :status-message="workerStatus" :is-running="isRunning"
          @clear="clearConsole" />
      </div>
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

const isReady = ref<boolean>(false);
const isRunning = ref<boolean>(false);
const initError = ref<boolean>(false);
const workerStatus = ref<string>('Initializing PHP 8.5 WebAssembly...');

const stdout = ref<string>('');
const stderr = ref<string>('');
const exitCode = ref<number | null>(null);
const duration = ref<string>('');
const transformedCode = ref<string>('');
const copied = ref<boolean>(false);

const { site } = useData();
let worker: Worker | null = null;

onMounted(() => {
  // 1. Read URL hash if shared
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

  // 2. Initialize Web Worker using browser-standard module Worker
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
      stderr.value = `Worker Error: ${errorMsg}\nLocation: ${errorEvent.filename || 'playground.worker.ts'}:${errorEvent.lineno || 0}\n\nCheck browser DevTools (F12) Console for full error trace.`;
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

function onSelectPreset() {
  const matched = presets.find((p) => p.id === selectedPresetId.value);
  if (matched) {
    code.value = matched.code;
    clearConsole();
    triggerTransform();
  }
}

function runCode() {
  const activeWorker = worker;
  if (!activeWorker || !isReady.value || isRunning.value) return;

  isRunning.value = true;
  clearConsole();

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

function shareSnippet() {
  const compressed = LZString.compressToEncodedURIComponent(code.value);
  const shareUrl = `${window.location.origin}${window.location.pathname}#code=${compressed}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
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

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
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

.playground-workspace {
  display: flex;
  flex: 1;
  height: calc(100% - 49px);
  overflow: hidden;
}

.editor-pane {
  flex: 1;
  height: 100%;
  border-right: 1px solid var(--vp-c-divider);
}

.output-pane {
  flex: 1;
  height: 100%;
}

@media (max-width: 960px) {
  .playground-workspace {
    flex-direction: column;
  }

  .editor-pane {
    height: 50%;
    border-right: none;
    border-bottom: 1px solid var(--vp-c-divider);
  }

  .output-pane {
    height: 50%;
  }

  .key-hint {
    display: none;
  }
}
</style>