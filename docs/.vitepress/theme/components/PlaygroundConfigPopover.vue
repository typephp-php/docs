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
        <!-- 0. Master Switch: Full Width Top Banner -->
        <div class="config-card master-banner">
          <div class="config-card-header">
            <span class="config-label">Enable TypePHP Enforcement</span>
            <button
              :class="['toggle-switch', { active: modelValue.enabled }]"
              title="Toggle runtime type checking"
              @click="updateField('enabled', !modelValue.enabled)"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>
          <span class="config-desc">Turn OFF to run pure native PHP for zero-overhead baseline benchmarking.</span>
        </div>

        <!-- 2-Column Responsive Grid -->
        <div class="config-grid">
          <!-- Column 1, Item 1: Array Validation Strategy -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Array Validation</span>
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
            <span class="config-desc">Full scans 100% of items. Hybrid uses O(1) sampling on arrays &gt; 128 items.</span>
          </div>

          <!-- Column 2, Item 1: Dynamic Property Reads (__get) -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Property Reads (__get)</span>
              <button
                :class="['toggle-switch', { active: modelValue.magicPropertyReads }]"
                @click="updateField('magicPropertyReads', !modelValue.magicPropertyReads)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
            <span class="config-desc">Enforces @property-read on __get(). Keep OFF for unhydrated ORM models.</span>
          </div>

          <!-- Column 1, Item 2: Strict Generic Return Invariance -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Return Invariance</span>
              <button
                :class="['toggle-switch', { active: modelValue.strictReturnGenericInvariance }]"
                @click="updateField('strictReturnGenericInvariance', !modelValue.strictReturnGenericInvariance)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
            <span class="config-desc">PHPStan Level MAX invariance. Turn OFF for pragmatic return covariance.</span>
          </div>

          <!-- Column 2, Item 2: Respect Ignore Tags -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Respect Ignore Tags</span>
              <button
                :class="['toggle-switch', { active: modelValue.respectIgnoreTags }]"
                @click="updateField('respectIgnoreTags', !modelValue.respectIgnoreTags)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
            <span class="config-desc">Honors @typephp-ignore tags. Turn OFF to simulate a strict CI/CD audit run.</span>
          </div>

          <!-- Column 1, Item 3: Respect Native Nullability -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Native Nullability</span>
              <button
                :class="['toggle-switch', { active: modelValue.respectNativeNullability }]"
                @click="updateField('respectNativeNullability', !modelValue.respectNativeNullability)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
            <span class="config-desc">Permits null if native parameter has ?Type even if omitted in DocBlock.</span>
          </div>

          <!-- Column 2, Item 3: Ignore Trace Depth -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Ignore Trace Depth</span>
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
            <span class="config-desc">Maximum call stack frames inspected above a failure for ignore tags.</span>
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

/* Desktop: Anchored Dropdown (2-Column) */
.config-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 100;
  width: 580px;
  max-width: calc(100vw - 24px);
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
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
  font-size: 13px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.popover-close-btn {
  background: none;
  border: none;
  font-size: 18px;
  line-height: 1;
  color: var(--vp-c-text-2);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
}

.popover-close-btn:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.popover-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* 2-Column Responsive Grid */
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
}

/* Card item layout */
.config-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  transition: border-color 0.15s ease;
}

.config-card:hover {
  border-color: var(--vp-c-brand-1);
}

.config-card.master-banner {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-divider);
}

.config-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.config-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.config-desc {
  font-size: 10px;
  color: var(--vp-c-text-2);
  line-height: 1.35;
}

/* Controls */
.pill-group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg);
  flex-shrink: 0;
}

.pill-btn {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.pill-btn.active {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.toggle-switch {
  position: relative;
  width: 30px;
  height: 16px;
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
  top: 1px;
  left: 1px;
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
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg);
  flex-shrink: 0;
}

.stepper-btn {
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 700;
  background: transparent;
  border: none;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.stepper-btn:hover:not(:disabled) {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-brand-1);
}

.stepper-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stepper-val {
  min-width: 24px;
  text-align: center;
  font-size: 10.5px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  padding: 0 2px;
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

@media (max-width: 768px) {
  .config-popover {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(340px, calc(100vw - 32px));
    max-width: calc(100vw - 32px);
    max-height: 85vh;
    right: auto;
    bottom: auto;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45), 0 0 0 100vmax rgba(0, 0, 0, 0.4);
  }

  .config-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>