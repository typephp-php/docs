<template>
  <div
    class="playground-root"
    :style="{ '--playground-font-size': `${fontSize}px` }"
  >
    <!-- Top Action Toolbar -->
    <header class="playground-toolbar">
      <div class="toolbar-left">
        <select
          v-model="selectedPresetId"
          class="preset-select"
          @change="onSelectPreset"
        >
          <option v-for="preset in presets" :key="preset?.id" :value="preset?.id">
            [{{ preset?.badge }}] {{ preset?.name }}
          </option>
        </select>
      </div>

      <div class="toolbar-center">
        <!-- Run Button -->
        <button
          class="run-btn"
          :disabled="!isReady || isRunning"
          @click="runCode"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          <span>{{ isRunning ? 'Running...' : 'Run' }}</span>
          <span class="key-hint">Ctrl+Enter</span>
        </button>

        <!-- View Mode Switcher -->
        <div class="view-mode-toggle">
          <button
            :class="['mode-btn', { active: viewMode === 'source' }]"
            @click="viewMode = 'source'"
          >
            Source
          </button>
          <button
            :class="['mode-btn', { active: viewMode === 'xray' }]"
            title="Inspect TypePHP AST injected checks in-place with zero line-drift"
            @click="viewMode = 'xray'"
          >
            Transformed Source
          </button>
        </div>
      </div>

      <div class="toolbar-right">
        <!-- Engine Config Popover Trigger -->
        <div ref="configWrapperRef" class="config-popover-wrapper">
          <button
            :class="['action-btn', 'config-trigger-btn', { active: isConfigOpen, 'has-custom': hasCustomConfig }]"
            title="TypePHP Engine Configuration"
            @click.stop="isConfigOpen = !isConfigOpen"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            <span>Config</span>
            <span v-if="hasCustomConfig" class="config-active-dot" title="Custom configuration active"></span>
          </button>

          <!-- Popover Card -->
          <div v-if="isConfigOpen" class="config-popover" @click.stop>
            <div class="popover-header">
              <span class="popover-title">Engine Configuration</span>
              <button class="popover-close-btn" @click="isConfigOpen = false">&times;</button>
            </div>

            <div class="popover-body">
              <!-- 1. Array Validation Strategy -->
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">Array Validation Strategy</span>
                  <span class="config-desc">Full scans 100% of items. Hybrid switches to O(1) sampling on arrays &gt; 128 items.</span>
                </div>
                <div class="pill-group">
                  <button
                    :class="['pill-btn', { active: config.arrayValidation === 'full' }]"
                    @click="config.arrayValidation = 'full'"
                  >Full O(n)</button>
                  <button
                    :class="['pill-btn', { active: config.arrayValidation === 'hybrid' }]"
                    @click="config.arrayValidation = 'hybrid'"
                  >Hybrid O(1)</button>
                </div>
              </div>

              <!-- 2. Strict Generic Return Invariance -->
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">Strict Generic Return Invariance</span>
                  <span class="config-desc">PHPStan Level MAX invariance. Turn OFF for pragmatic return covariance (LSP).</span>
                </div>
                <button
                  :class="['toggle-switch', { active: config.strictReturnGenericInvariance }]"
                  @click="config.strictReturnGenericInvariance = !config.strictReturnGenericInvariance"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>

              <!-- 3. Respect Native Nullability -->
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">Respect Native Nullability</span>
                  <span class="config-desc">Permits null if native parameter has ?Type even if omitted in DocBlock.</span>
                </div>
                <button
                  :class="['toggle-switch', { active: config.respectNativeNullability }]"
                  @click="config.respectNativeNullability = !config.respectNativeNullability"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>

              <!-- 4. Respect Ignore Tags -->
              <div class="config-row">
                <div class="config-info">
                  <span class="config-label">Respect @typephp-ignore Tags</span>
                  <span class="config-desc">Honors ignore tags. Turn OFF to simulate a strict CI/CD audit run.</span>
                </div>
                <button
                  :class="['toggle-switch', { active: config.respectIgnoreTags }]"
                  @click="config.respectIgnoreTags = !config.respectIgnoreTags"
                >
                  <span class="toggle-knob"></span>
                </button>
              </div>
            </div>

            <div class="popover-footer">
              <button
                class="reset-config-btn"
                :disabled="!hasCustomConfig"
                @click="resetConfig"
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>

        <!-- Font Zoom Widget -->
        <div class="font-zoom-widget" title="Adjust text size">
          <button
            class="zoom-btn"
            :disabled="fontSize <= 11"
            title="Decrease font size"
            @click="adjustFontSize(-1)"
          >
            A-
          </button>
          <span class="font-size-label">{{ fontSize }}px</span>
          <button
            class="zoom-btn"
            :disabled="fontSize >= 20"
            title="Increase font size"
            @click="adjustFontSize(1)"
          >
            A+
          </button>
        </div>

        <button class="action-btn" title="Copy code to clipboard" @click="copyEditorCode">
          {{ copiedCode ? 'Copied' : 'Copy Code' }}
        </button>

        <button class="action-btn" title="Share URL" @click="shareSnippet">
          {{ copiedLink ? 'Copied' : 'Share' }}
        </button>

        <span class="engine-badge" :title="workerStatus">
          <span :class="['status-dot', { active: isReady, loading: !isReady && !initError, error: initError }]"></span>
          PHP 8.5
        </span>
      </div>
    </header>

    <!-- Main Workspace -->
    <main :class="['playground-workspace', `layout-${effectivePosition}`]">
      <div class="editor-pane">
        <PlaygroundEditor
          :model-value="viewMode === 'source' ? code : transformedCode"
          :read-only="viewMode === 'xray'"
          :font-size="fontSize"
          @update:model-value="onCodeUpdate"
          @run="runCode"
        />
      </div>

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
import PlaygroundEditor from './PlaygroundEditor.vue';
import PlaygroundOutput from './PlaygroundOutput.vue';

const presets = PLAYGROUND_PRESETS;
const selectedPresetId = ref<string>(presets[0]?.id ?? '');
const code = ref<string>(presets[0]?.code ?? '<?php\n');

const viewMode = ref<'source' | 'xray'>('source');
const layoutPosition = ref<'bottom' | 'side'>('bottom');
const windowWidth = ref<number>(typeof window !== 'undefined' ? window.innerWidth : 1200);
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

// Config Popover State
const isConfigOpen = ref<boolean>(false);
const configWrapperRef = ref<HTMLDivElement | null>(null);
const config = ref<PlaygroundConfig>({ ...DEFAULT_PLAYGROUND_CONFIG });

const hasCustomConfig = computed<boolean>(() => {
  return (
    config.value.arrayValidation !== DEFAULT_PLAYGROUND_CONFIG.arrayValidation ||
    config.value.strictReturnGenericInvariance !== DEFAULT_PLAYGROUND_CONFIG.strictReturnGenericInvariance ||
    config.value.respectNativeNullability !== DEFAULT_PLAYGROUND_CONFIG.respectNativeNullability ||
    config.value.respectIgnoreTags !== DEFAULT_PLAYGROUND_CONFIG.respectIgnoreTags
  );
});

const { site } = useData();
let worker: Worker | null = null;

const effectivePosition = computed<'bottom' | 'side'>(() => {
  if (windowWidth.value < 960) {
    return 'bottom';
  }
  return layoutPosition.value;
});

function handleWindowResize() {
  windowWidth.value = window.innerWidth;
}

function handleDocumentClick(e: MouseEvent) {
  if (configWrapperRef.value && !configWrapperRef.value.contains(e.target as Node)) {
    isConfigOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize);
  document.addEventListener('click', handleDocumentClick);

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

function onCodeUpdate(newCode: string) {
  code.value = newCode;
  triggerTransform();
}

function onSelectPreset() {
  const matched = presets.find((p) => p.id === selectedPresetId.value);
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
    document.removeEventListener('click', handleDocumentClick);
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

.playground-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background-color: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
  gap: 10px;
}

.toolbar-left, .toolbar-center, .toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select {
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: 5px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  outline: none;
  max-width: 260px;
}

.preset-select:hover {
  border-color: var(--vp-c-brand-1);
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: var(--vp-c-brand-1);
  color: #fff;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.run-btn:hover:not(:disabled) {
  background-color: var(--vp-c-brand-2);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-hint {
  font-size: 10px;
  padding: 1px 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  opacity: 0.85;
}

.view-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.mode-btn {
  padding: 4px 10px;
  font-size: 11.5px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn:hover {
  color: var(--vp-c-text-1);
}

.mode-btn.active {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.config-popover-wrapper {
  position: relative;
  display: inline-flex;
}

.config-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  position: relative;
}

.config-active-dot {
  position: absolute;
  top: -2px;
  right: -2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 1.5px var(--vp-c-bg);
}

.config-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
  width: 320px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--vp-c-bg-mute);
  border-bottom: 1px solid var(--vp-c-divider);
}

.popover-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.popover-close-btn {
  background: none;
  border: none;
  font-size: 16px;
  line-height: 1;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.popover-close-btn:hover {
  color: var(--vp-c-text-1);
}

.popover-body {
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.config-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.config-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.config-desc {
  font-size: 10.5px;
  color: var(--vp-c-text-2);
  line-height: 1.3;
}

.pill-group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  overflow: hidden;
  background: var(--vp-c-bg-mute);
  flex-shrink: 0;
}

.pill-btn {
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.pill-btn.active {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.toggle-switch {
  position: relative;
  width: 32px;
  height: 18px;
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.toggle-switch.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 50%;
  transition: transform 0.2s ease;
}

.toggle-switch.active .toggle-knob {
  transform: translateX(14px);
}

.popover-footer {
  padding: 8px 14px;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
  display: flex;
  justify-content: flex-end;
}

.reset-config-btn {
  background: none;
  border: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  cursor: pointer;
}

.reset-config-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  color: var(--vp-c-text-3);
}

.font-zoom-widget {
  display: inline-flex;
  align-items: center;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  overflow: hidden;
}

.zoom-btn {
  padding: 2px 6px;
  font-size: 10.5px;
  font-weight: 700;
  background: transparent;
  border: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
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
  font-size: 10.5px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding: 0 4px;
  font-family: var(--vp-font-family-mono);
  user-select: none;
}

.action-btn {
  padding: 3px 8px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.engine-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  padding: 2px 6px;
  border-radius: 10px;
  border: 1px solid var(--vp-c-divider);
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #9ca3af;
}

.status-dot.active { background: #10b981; }
.status-dot.loading { background: #f59e0b; animation: pulse 1s infinite; }
.status-dot.error { background: #ef4444; }

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
}

.playground-workspace.layout-side {
  flex-direction: row;
}

.playground-workspace.layout-side .editor-pane {
  flex: 1;
  min-width: 0;
  height: 100%;
}

/* Tablet & Mobile Layout (< 960px) */
@media (max-width: 960px) {
  .playground-toolbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
  }

  .toolbar-left {
    width: 100%;
  }

  .preset-select {
    max-width: 100%;
    width: 100%;
  }

  .toolbar-center, .toolbar-right {
    justify-content: space-between;
  }

  .config-popover {
    right: auto;
    left: 0;
    width: 290px;
  }

  .playground-workspace {
    flex-direction: column !important;
  }

  .editor-pane {
    height: 55% !important;
    width: 100% !important;
  }

  .key-hint {
    display: none;
  }
}

@media (max-width: 640px) {
  .font-zoom-widget {
    display: none;
  }
}
</style>