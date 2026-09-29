<template>
  <header class="playground-toolbar">
    <!-- Left: Title Input AND Presets Dropdown -->
    <div class="toolbar-left">
      <!-- 1. Highlighted Snippet Title -->
      <div class="snippet-title-group" title="Click to rename snippet">
        <svg class="file-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
        <input
          :value="snippetTitle"
          type="text"
          class="snippet-title-input"
          placeholder="Untitled Snippet..."
          aria-label="Snippet Title"
          @input="$emit('update:snippet-title', ($event.target as HTMLInputElement).value)"
        />
      </div>

      <!-- 2. Presets Dropdown Button (Guaranteed to render) -->
      <div class="preset-dropdown-wrapper" title="Load an example preset">
        <button class="preset-pill-btn" type="button" tabindex="-1">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <span>Presets</span>
          <svg class="select-chevron" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        <select
          class="preset-select-overlay"
          :value="selectedPresetId"
          aria-label="Select Preset"
          @change="$emit('select-preset', ($event.target as HTMLSelectElement).value)"
        >
          <option value="" disabled hidden>Presets</option>
          <option v-if="selectedPresetId === 'custom'" value="custom" disabled>
            [Custom] {{ snippetTitle || 'Untitled Snippet' }}
          </option>
          <option v-for="preset in presets" :key="preset?.id" :value="preset?.id">
            [{{ preset?.badge }}] {{ preset?.name }}
          </option>
        </select>
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
        <span>{{ !isReady ? '...' : (isRunning ? '...' : 'Run') }}</span>
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
          <span class="mode-label-desktop">Transformed Source</span>
          <span class="mode-label-mobile">Transformed</span>
        </button>
      </div>
    </div>

    <!-- Right: Config, Zoom, SVG Action Icons & Engine Badge -->
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

      <!-- Action Icons (Using standard SVG paths for 100% production rendering) -->
      <div class="icon-group">
        <!-- 1. Format Code (Auto-indent) -->
        <button
          class="icon-action-btn"
          title="Format Code (Auto-indent)"
          aria-label="Format Code"
          @click="$emit('format')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10H7M21 6H3M21 14H3M21 18H7" />
          </svg>
        </button>

        <!-- 2. Copy Code -->
        <button
          :class="['icon-action-btn', { success: copiedCode }]"
          :title="copiedCode ? 'Code Copied!' : 'Copy Code'"
          aria-label="Copy Code"
          @click="$emit('copy-code')"
        >
          <svg v-if="!copiedCode" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>

        <!-- 3. Share Snippet -->
        <button
          :class="['icon-action-btn', { success: copiedLink }]"
          :title="copiedLink ? 'Share Link Copied!' : 'Share Snippet URL'"
          aria-label="Share Snippet URL"
          @click="$emit('share')"
        >
          <svg v-if="!copiedLink" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </button>
      </div>

      <!-- Engine Badge -->
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
  snippetTitle: string;
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
  (e: 'update:snippet-title', title: string): void;
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 42px;
  padding: 0 14px;
  background-color: var(--vp-c-bg);
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
  gap: 12px;
  box-sizing: border-box;
}

/* Left Group */
.toolbar-left {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  min-width: 0 !important;
  z-index: 1;
}

/* Document Title */
.snippet-title-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
  border: 1px solid transparent;
  transition: all 0.2s ease;
  min-width: 0;
}

.snippet-title-group:hover,
.snippet-title-group:focus-within {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg-mute);
}

.file-icon {
  color: var(--vp-c-brand-1);
  flex-shrink: 0;
}

.snippet-title-input {
  background: transparent;
  border: none;
  outline: none;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  width: 200px;
  max-width: 25vw;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snippet-title-input::placeholder {
  color: var(--vp-c-text-3);
  font-weight: 500;
}

/* Presets Dropdown */
.preset-dropdown-wrapper {
  position: relative;
  display: inline-flex !important;
  align-items: center;
  flex-shrink: 0 !important;
  visibility: visible !important;
}

.preset-pill-btn {
  display: inline-flex !important;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  pointer-events: none;
  transition: all 0.15s ease;
  white-space: nowrap;
  visibility: visible !important;
}

.preset-dropdown-wrapper:hover .preset-pill-btn {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.select-chevron {
  color: var(--vp-c-text-3);
  transition: transform 0.2s ease;
}

.preset-dropdown-wrapper:hover .select-chevron {
  color: var(--vp-c-brand-1);
}

.preset-select-overlay {
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  direction: rtl;
}

.preset-select-overlay option {
  direction: ltr;
  text-align: left;
}

/* Center Group: Dead-Center */
.toolbar-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
  z-index: 1;
}

.run-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  background-color: var(--vp-c-brand-1);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.run-btn:hover:not(:disabled) {
  background-color: var(--vp-c-brand-2);
}

.run-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.key-hint {
  font-size: 9.5px;
  padding: 1px 4px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  opacity: 0.85;
}

.view-mode-toggle {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  height: 28px;
  background: var(--vp-c-bg);
  flex-shrink: 0;
}

.mode-btn {
  padding: 0 10px;
  font-size: 11.5px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.mode-btn:hover {
  color: var(--vp-c-text-1);
}

.mode-btn.active {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.mode-label-mobile {
  display: none;
}

/* Right Group */
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
  z-index: 1;
}

.icon-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.font-zoom-widget {
  display: inline-flex;
  align-items: center;
  height: 28px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
}

.zoom-btn {
  padding: 0 6px;
  height: 100%;
  font-size: 10px;
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
  font-size: 10px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  padding: 0 3px;
  font-family: var(--vp-font-family-mono);
  user-select: none;
}

/* Action Icon Buttons */
.icon-action-btn {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  min-height: 28px !important;
  padding: 0 !important;
  border: 1px solid var(--vp-c-divider) !important;
  background: var(--vp-c-bg) !important;
  color: var(--vp-c-text-1) !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  flex-shrink: 0 !important;
}

.icon-action-btn:hover {
  border-color: var(--vp-c-brand-1) !important;
  color: var(--vp-c-brand-1) !important;
}

.icon-action-btn.success {
  border-color: #10b981 !important;
  color: #10b981 !important;
  background: rgba(16, 185, 129, 0.08) !important;
}

.icon-action-btn svg {
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  display: block !important;
  stroke: currentColor !important;
  fill: none !important;
  flex-shrink: 0 !important;
}

.engine-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-mute);
  padding: 0 7px;
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
  white-space: nowrap;
  flex-shrink: 0;
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

/* ========================================================
   Mobile Breakpoint (< 860px)
   ======================================================== */
@media (max-width: 860px) {
  .playground-toolbar {
    height: auto !important;
    flex-wrap: wrap !important;
    padding: 6px 10px !important;
    gap: 8px !important;
  }

  .toolbar-left {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 8px !important;
  }

  .snippet-title-group {
    flex: 1 1 auto !important;
    min-width: 0 !important;
  }

  .snippet-title-input {
    width: 100% !important;
    max-width: 100% !important;
  }

  .preset-dropdown-wrapper {
    flex-shrink: 0 !important;
  }

  .toolbar-center {
    position: static !important;
    transform: none !important;
  }

  .key-hint {
    display: none !important;
  }

  .font-zoom-widget {
    display: none !important;
  }

  .engine-badge {
    display: none !important;
  }

  .mode-label-desktop {
    display: none !important;
  }

  .mode-label-mobile {
    display: inline !important;
  }
}
</style>