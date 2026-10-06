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
      <span class="config-btn-label">Config</span>
      <span v-if="hasCustomConfig" class="config-active-dot" title="Custom configuration active"></span>
    </button>

    <!-- Popover Card -->
    <div v-if="isOpen" class="config-popover" @click.stop>
      <!-- Fixed Header -->
      <div class="popover-header">
        <span class="popover-title">Engine Configuration</span>
        <button class="popover-close-btn" @click="close">&times;</button>
      </div>

      <!-- Scrollable Body -->
      <div class="popover-body">
        <!-- 0. Master Switch -->
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

        <!-- 1. Violation Strategy Banner (Throw | Warn | Report) -->
        <div class="config-card strategy-banner">
          <div class="config-card-header">
            <span class="config-label">Violation Strategy</span>
            <div class="pill-group">
              <button
                :class="['pill-btn', { active: modelValue.onViolation === 'throw' }]"
                title="Throw TypeError on first contract failure"
                @click="updateField('onViolation', 'throw')"
              >Throw</button>
              <button
                :class="['pill-btn', { active: modelValue.onViolation === 'warn' }]"
                title="Log E_USER_WARNING and continue execution"
                @click="updateField('onViolation', 'warn')"
              >Warn</button>
              <button
                :class="['pill-btn', { active: modelValue.onViolation === 'report' }]"
                title="Collect all violations and export structured JSON audit report"
                @click="updateField('onViolation', 'report')"
              >Report</button>
            </div>
          </div>
          <span class="config-desc">
            {{
              modelValue.onViolation === 'throw'
                ? 'Strict mode: Halts execution immediately upon first contract violation.'
                : (modelValue.onViolation === 'warn'
                    ? 'Non-blocking mode: Logs PHP warnings and lets execution complete.'
                    : 'Audit mode: Collects all violations silently and outputs structured JSON report.')
            }}
          </span>
        </div>

        <!-- 2-Column Responsive Grid -->
        <div class="config-grid">
          <!-- Array Validation Strategy -->
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

          <!-- Redact Values (GDPR/PII) -->
          <div class="config-card">
            <div class="config-card-header">
              <span class="config-label">Redact Raw Values</span>
              <button
                :class="['toggle-switch', { active: modelValue.redactValues }]"
                title="Mask raw values in errors and reports for GDPR/HIPAA compliance"
                @click="updateField('redactValues', !modelValue.redactValues)"
              >
                <span class="toggle-knob"></span>
              </button>
            </div>
            <span class="config-desc">Masks raw values in errors (e.g. 'string given' instead of secret values).</span>
          </div>

          <!-- Strict Generic Return Invariance -->
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

          <!-- Dynamic Property Reads (__get) -->
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

          <!-- Respect Native Nullability -->
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

          <!-- Respect Ignore Tags -->
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

          <!-- Ignore Trace Depth -->
          <div class="config-card full-span-card">
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

        <!-- Inline Variables (@var) Full-Width Section -->
        <div class="config-card inline-vars-banner">
          <div class="config-card-header">
            <div class="inline-vars-title-group">
              <span class="config-label">Inline Variables (@var)</span>
              <span class="inline-vars-status">
                {{ activeInlineCount }}/6 Active
              </span>
            </div>
            <button
              :class="['toggle-switch', { active: isAllInlineVarsActive }]"
              title="Toggle all inline variable checks"
              @click="toggleAllInlineVars(!isAllInlineVarsActive)"
            >
              <span class="toggle-knob"></span>
            </button>
          </div>
          <span class="config-desc">Enforce types on local assignments & compound operations ($x = ..., $score += 5):</span>
          
          <div class="inline-chips-group">
            <button
              v-for="cat in inlineCategories"
              :key="cat.key"
              :class="['inline-chip-btn', { active: modelValue.inlineVars?.[cat.key] }]"
              @click="toggleInlineCategory(cat.key)"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- Fixed Footer: Always Visible -->
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
import { ref, computed, onMounted, onUnmounted } from 'vue';
import type { PlaygroundConfig, InlineVarsConfig } from '../presets';

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

const inlineCategories: Array<{ key: keyof InlineVarsConfig; label: string }> = [
  { key: 'scalars', label: 'Scalars' },
  { key: 'arrays', label: 'Arrays' },
  { key: 'properties', label: 'Properties' },
  { key: 'generics', label: 'Generics' },
  { key: 'callables', label: 'Callables' },
  { key: 'objects', label: 'Objects' },
];

const activeInlineCount = computed(() => {
  const iv = props.modelValue.inlineVars || {};
  return inlineCategories.filter((c) => iv[c.key]).length;
});

const isAllInlineVarsActive = computed(() => activeInlineCount.value > 0);

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

function toggleInlineCategory(cat: keyof InlineVarsConfig) {
  const current = props.modelValue.inlineVars || {
    properties: true,
    generics: true,
    callables: true,
    scalars: true,
    arrays: true,
    objects: true,
  };

  emit('update:modelValue', {
    ...props.modelValue,
    inlineVars: {
      ...current,
      [cat]: !current[cat],
    },
  });
}

function toggleAllInlineVars(state: boolean) {
  emit('update:modelValue', {
    ...props.modelValue,
    inlineVars: {
      properties: state,
      generics: state,
      callables: state,
      scalars: state,
      arrays: state,
      objects: state,
    },
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
  z-index: 50;
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
  width: 580px;
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 120px); 
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: var(--vp-c-bg-mute);
  border-bottom: 1px solid var(--vp-c-divider);
  flex-shrink: 0;
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
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.popover-body::-webkit-scrollbar {
  width: 5px;
}

.popover-body::-webkit-scrollbar-thumb {
  background: var(--vp-c-divider);
  border-radius: 4px;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 8px;
}

.config-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 7px 9px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  transition: border-color 0.15s ease;
}

.config-card:hover {
  border-color: var(--vp-c-brand-1);
}

.config-card.master-banner,
.config-card.strategy-banner {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-divider);
}

.config-card.full-span-card {
  grid-column: 1 / -1;
}

.config-card.inline-vars-banner {
  background: var(--vp-c-bg-soft);
  gap: 5px;
}

.config-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.inline-vars-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.inline-vars-status {
  font-size: 10px;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-brand-1);
  background: rgba(59, 130, 246, 0.12);
  padding: 1px 5px;
  border-radius: 4px;
}

.config-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.config-desc {
  font-size: 9.5px;
  color: var(--vp-c-text-2);
  line-height: 1.35;
}

/* Category Chips */
.inline-chips-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 1px;
}

.inline-chip-btn {
  padding: 2px 7px;
  font-size: 9.5px;
  font-weight: 600;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.inline-chip-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-text-1);
}

.inline-chip-btn.active {
  background: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  color: #fff;
}

/* Pill Controls */
.pill-group {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  overflow: hidden;
  background: var(--vp-c-bg);
  flex-shrink: 0;
}

.pill-btn {
  padding: 1px 7px;
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

/* Fixed Footer: Always Pinned at Bottom */
.popover-footer {
  padding: 8px 14px;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
  display: flex;
  justify-content: flex-end;
  flex-shrink: 0;
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

@media (max-width: 860px) {
  .config-btn-label {
    display: none !important;
  }
  .config-trigger-btn {
    padding: 0 !important;
    width: 28px !important;
    height: 28px !important;
    justify-content: center !important;
  }
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
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45), 0 0 0 100vmax rgba(0, 0, 0, 0.4);
  }

  .config-grid {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>