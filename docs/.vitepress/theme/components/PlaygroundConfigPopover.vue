<template>
  <div ref="wrapperRef" class="config-popover-wrapper">
    <!-- Trigger Button -->
    <button
      :class="['action-btn', 'config-trigger-btn', { active: isOpen, 'has-custom': hasCustomConfig }]"
      title="TypePHP Engine Configuration"
      @click.stop="togglePopover"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span>Config</span>
      <span v-if="hasCustomConfig" class="config-active-dot" title="Custom configuration active"></span>
    </button>

    <!-- Popover Card -->
    <div v-if="isOpen" class="config-popover" @click.stop>
      <div class="popover-header">
        <span class="popover-title">Engine Configuration</span>
        <button class="popover-close-btn" @click="close">&times;</button>
      </div>

      <div class="popover-body">
        <!-- 0. Master Switch: Enable / Disable -->
        <div class="config-row master-toggle">
          <div class="config-info">
            <span class="config-label">Enable TypePHP Enforcement</span>
            <span class="config-desc">Turn OFF to run pure native PHP for zero-overhead baseline benchmarking.</span>
          </div>
          <button
            :class="['toggle-switch', { active: modelValue.enabled }]"
            @click="updateField('enabled', !modelValue.enabled)"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>

        <!-- 1. Array Validation Strategy -->
        <div class="config-row">
          <div class="config-info">
            <span class="config-label">Array Validation Strategy</span>
            <span class="config-desc">Full scans 100% of items. Hybrid switches to O(1) sampling on arrays &gt; 128 items.</span>
          </div>
          <div class="pill-group">
            <button
              :class="['pill-btn', { active: modelValue.arrayValidation === 'full' }]"
              @click="updateField('arrayValidation', 'full')"
            >Full O(n)</button>
            <button
              :class="['pill-btn', { active: modelValue.arrayValidation === 'hybrid' }]"
              @click="updateField('arrayValidation', 'hybrid')"
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
            :class="['toggle-switch', { active: modelValue.strictReturnGenericInvariance }]"
            @click="updateField('strictReturnGenericInvariance', !modelValue.strictReturnGenericInvariance)"
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
            :class="['toggle-switch', { active: modelValue.respectNativeNullability }]"
            @click="updateField('respectNativeNullability', !modelValue.respectNativeNullability)"
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
            :class="['toggle-switch', { active: modelValue.respectIgnoreTags }]"
            @click="updateField('respectIgnoreTags', !modelValue.respectIgnoreTags)"
          >
            <span class="toggle-knob"></span>
          </button>
        </div>

        <!-- 5. Ignore Trace Depth -->
        <div class="config-row">
          <div class="config-info">
            <span class="config-label">Ignore Trace Depth</span>
            <span class="config-desc">Maximum call stack frames inspected above a failure for ignore tags.</span>
          </div>
          <div class="stepper-widget">
            <button
              class="stepper-btn"
              :disabled="modelValue.ignoreTraceDepth <= 5"
              @click="adjustDepth(-5)"
            >-5</button>
            <span class="stepper-val">{{ modelValue.ignoreTraceDepth }}</span>
            <button
              class="stepper-btn"
              :disabled="modelValue.ignoreTraceDepth >= 100"
              @click="adjustDepth(5)"
            >+5</button>
          </div>
        </div>
      </div>

      <div class="popover-footer">
        <button
          class="reset-config-btn"
          :disabled="!hasCustomConfig"
          @click="$emit('reset')"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import type { PlaygroundConfig } from '../presets';

const props = defineProps<{
  modelValue: PlaygroundConfig;
  hasCustomConfig: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: PlaygroundConfig): void;
  (e: 'reset'): void;
}>();

const isOpen = ref<boolean>(false);
const wrapperRef = ref<HTMLDivElement | null>(null);

function togglePopover() {
  isOpen.value = !isOpen.value;
}

function close() {
  isOpen.value = false;
}

function updateField<K extends keyof PlaygroundConfig>(field: K, value: PlaygroundConfig[K]) {
  emit('update:modelValue', {
    ...props.modelValue,
    [field]: value,
  });
}

function adjustDepth(delta: number) {
  const current = props.modelValue.ignoreTraceDepth || 25;
  updateField('ignoreTraceDepth', Math.max(1, Math.min(100, current + delta)));
}

function onDocumentClick(e: MouseEvent) {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<style scoped>
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
  width: 330px;
  max-height: calc(100vh - 100px);
  display: flex;
  flex-direction: column;
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
  overflow-y: auto;
}

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.config-row.master-toggle {
  padding-bottom: 10px;
  border-bottom: 1px dashed var(--vp-c-divider);
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

.stepper-widget {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--vp-c-bg-mute);
  flex-shrink: 0;
}

.stepper-btn {
  padding: 2px 7px;
  font-size: 11px;
  font-weight: 700;
  background: transparent;
  border: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-brand-1);
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stepper-val {
  min-width: 30px;
  text-align: center;
  font-size: 11.5px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  padding: 0 4px;
  user-select: none;
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

@media (max-width: 960px) {
  .config-popover {
    right: auto;
    left: 0;
    width: 290px;
  }
}
</style>