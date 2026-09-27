<template>
  <div
    class="playground-root"
    :style="{ '--playground-font-size': `${fontSize}px` }"
  >
    <!-- Top Action Toolbar Partial -->
    <PlaygroundToolbar
      :presets="presets"
      :selected-preset-id="selectedPresetId"
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

      <!-- Output Console Partial -->
      <PlaygroundOutput
        ref="outputDrawerRef"
        :position="effectivePosition"
        :stdout="stdout"
        :stderr="stderr"
        :exit-code="exitCode"
        :duration="duration"
        :status-message="workerStatus"
        :is-running="isRunning"
        @clear="clearConsole"
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
  type PlaygroundConfig
} from '../presets';
import PlaygroundToolbar from './PlaygroundToolbar.vue';
import PlaygroundLoadingOverlay from './PlaygroundLoadingOverlay.vue';
import PlaygroundEditor from './PlaygroundEditor.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const presets = PLAYGROUND_PRESETS;
const selectedPresetId = ref<string>(presets[0]?.id ?? '');
const code = ref<string>(presets[0]?.code ?? '<?php\n');

const viewMode = ref<'source' | 'xray'>('source');
const layoutPosition = ref<'bottom' | 'side'>('bottom');
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

const copiedLink = ref<boolean>(false);
const copiedCode = ref<boolean>(false);

const config = ref<PlaygroundConfig>({ ...DEFAULT_PLAYGROUND_CONFIG });

const hasCustomConfig = computed<boolean>(() => {
  return (
    config.value.enabled !== DEFAULT_PLAYGROUND_CONFIG.enabled ||
    config.value.ignoreTraceDepth !== DEFAULT_PLAYGROUND_CONFIG.ignoreTraceDepth ||
    config.value.arrayValidation !== DEFAULT_PLAYGROUND_CONFIG.arrayValidation ||
    config.value.strictReturnGenericInvariance !== DEFAULT_PLAYGROUND_CONFIG.strictReturnGenericInvariance ||
    config.value.respectNativeNullability !== DEFAULT_PLAYGROUND_CONFIG.respectNativeNullability ||
    config.value.respectIgnoreTags !== DEFAULT_PLAYGROUND_CONFIG.respectIgnoreTags
  );
});

const { site } = useData();
let worker: Worker | null = null;

const effectivePosition = computed<'bottom' | 'side'>(() => {
  return windowWidth.value < 960 ? 'bottom' : layoutPosition.value;
});

function handleWindowResize() {
  windowWidth.value = window.innerWidth;
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize);

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
    }

    const savedConfig = localStorage.getItem('typephp_playground_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed && typeof parsed === 'object') {
        config.value = { ...DEFAULT_PLAYGROUND_CONFIG, ...parsed };
      }
    }
  } catch {}

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
            if (parsed.config) {
              config.value = { ...DEFAULT_PLAYGROUND_CONFIG, ...parsed.config };
            }
          } else {
            code.value = decompressed;
          }
        } catch {
          code.value = decompressed;
        }
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

watch(config, (newConf) => {
  try {
    localStorage.setItem('typephp_playground_config', JSON.stringify(newConf));
  } catch {}
  triggerTransform();
}, { deep: true });

function resetConfig() {
  config.value = { ...DEFAULT_PLAYGROUND_CONFIG };
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
  triggerTransform();
}

function onSelectPreset(presetId: string) {
  selectedPresetId.value = presetId;
  const matched = presets.find((p) => p.id === presetId);
  if (matched) {
    code.value = matched.code;
    if (matched.config) {
      config.value = { ...DEFAULT_PLAYGROUND_CONFIG, ...matched.config };
    }
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
    code: code.value,
    config: config.value,
  };
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const shareUrl = `${window.location.origin}${window.location.pathname}#code=${compressed}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    copiedLink.value = true;
    setTimeout(() => {
      copiedLink.value = false;
    }, 2000);
  });
}

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', handleWindowResize);
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
  height: calc(100% - 45px);
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