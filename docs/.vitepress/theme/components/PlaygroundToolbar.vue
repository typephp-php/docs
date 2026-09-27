<template>
  <header class="playground-toolbar">
    <!-- Left: Preset Dropdown -->
    <div class="toolbar-left">
      <div class="preset-select-wrapper">
        <select
          :value="selectedPresetId"
          class="preset-select"
          @change="$emit('select-preset', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="preset in presets" :key="preset?.id" :value="preset?.id">
            [{{ preset?.badge }}] {{ preset?.name }}
          </option>
        </select>
        <svg
          class="select-chevron"
          viewBox="0 0 24 24"
          width="12"
          height="12"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
    </div>

    <!-- Center: Run & View Mode Switcher -->
    <div class="toolbar-center">
      <button
        class="run-btn"
        :disabled="!isReady || isRunning"
        @click="$emit('run')"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        <span>{{ !isReady ? 'Loading...' : (isRunning ? 'Running...' : 'Run') }}</span>
        <span class="key-hint">Ctrl+Enter</span>
      </button>

      <div class="view-mode-toggle">
        <button
          :class="['mode-btn', { active: viewMode === 'source' }]"
          @click="$emit('update:viewMode', 'source')"
        >
          Source
        </button>
        <button
          :class="['mode-btn', { active: viewMode === 'xray' }]"
          title="Inspect TypePHP AST injected checks in-place with zero line-drift"
          @click="$emit('update:viewMode', 'xray')"
        >
          Transformed Source
        </button>
      </div>
    </div>

    <!-- Right: Config, Zoom, Actions, Status -->
    <div class="toolbar-right">
      <!-- Config Popover -->
      <PlaygroundConfigPopover
        :model-value="config"
        :has-custom-config="hasCustomConfig"
        @update:model-value="$emit('update:config', $event)"
        @reset="$emit('reset-config')"
      />

      <!-- Font Zoom Widget -->
      <div class="font-zoom-widget" title="Adjust text size">
        <button
          class="zoom-btn"
          :disabled="fontSize <= 11"
          title="Decrease font size"
          @click="$emit('adjust-font-size', -1)"
        >
          A-
        </button>
        <span class="font-size-label">{{ fontSize }}px</span>
        <button
          class="zoom-btn"
          :disabled="fontSize >= 20"
          title="Increase font size"
          @click="$emit('adjust-font-size', 1)"
        >
          A+
        </button>
      </div>

      <button class="action-btn" title="Copy code to clipboard" @click="$emit('copy-code')">
        {{ copiedCode ? 'Copied' : 'Copy Code' }}
      </button>

      <button class="action-btn" title="Auto-indent code" @click="$emit('format')">
        Format
      </button>

      <button class="action-btn" title="Share URL" @click="$emit('share')">
        {{ copiedLink ? 'Copied' : 'Share' }}
      </button>

      <span class="engine-badge" :title="workerStatus">
        <span :class="['status-dot', { active: isReady, loading: !isReady && !initError, error: initError }]"></span>
        PHP 8.5
      </span>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { PlaygroundPreset, PlaygroundConfig } from '../presets';
import PlaygroundConfigPopover from './PlaygroundConfigPopover.vue';

defineProps<{
  presets: PlaygroundPreset[];
  selectedPresetId: string;
  viewMode: 'source' | 'xray';
  fontSize: number;
  isReady: boolean;
  isRunning: boolean;
  initError: boolean;
  workerStatus: string;
  config: PlaygroundConfig;
  hasCustomConfig: boolean;
  copiedCode: boolean;
  copiedLink: boolean;
}>();

defineEmits<{
  (e: 'select-preset', id: string): void;
  (e: 'run'): void;
  (e: 'update:viewMode', mode: 'source' | 'xray'): void;
  (e: 'adjust-font-size', delta: number): void;
  (e: 'copy-code'): void;
  (e: 'format'): void;
  (e: 'share'): void;
  (e: 'update:config', config: PlaygroundConfig): void;
  (e: 'reset-config'): void;
}>();
</script>

<style scoped>
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

/* Preset Dropdown Wrapper & Chevron */
.preset-select-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.preset-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding: 5px 30px 5px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  cursor: pointer;
  outline: none;
  width: 340px;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.preset-select:hover {
  border-color: var(--vp-c-brand-1);
}

.preset-select:focus {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 1px var(--vp-c-brand-1);
}

.select-chevron {
  position: absolute;
  right: 10px;
  pointer-events: none;
  color: var(--vp-c-text-2);
  transition: transform 0.2s ease, color 0.2s ease;
}

.preset-select-wrapper:hover .select-chevron {
  color: var(--vp-c-brand-1);
}

@media (min-width: 1280px) {
  .preset-select {
    width: 380px;
  }
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

@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

@media (max-width: 960px) {
  .playground-toolbar {
    flex-wrap: wrap;
    gap: 6px;
    padding: 6px 10px;
  }

  .toolbar-left {
    width: 100%;
  }

  .preset-select-wrapper {
    width: 100%;
  }

  .preset-select {
    max-width: 100%;
    width: 100%;
  }

  .toolbar-center, .toolbar-right {
    justify-content: space-between;
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