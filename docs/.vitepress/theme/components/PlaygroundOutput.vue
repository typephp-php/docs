<template>
  <button
    v-if="position === 'side' && isCollapsed"
    class="floating-edge-tab"
    title="Click to expand Console"
    @click="toggleCollapse"
  >
    <span class="tab-icon-wrapper">
      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.4-1.4 3.1-3.1-3.1-3.1L7.5 8l4.5 4.5-4.5 4.5z"/>
      </svg>
    </span>

    <span class="tab-label">Console</span>

    <span v-if="exitCode !== null" :class="['exit-badge-pill', exitCode === 0 ? 'success' : 'error']">
      {{ exitCode === 0 ? '0' : exitCode }}
    </span>

    <span class="tab-expand-arrow">
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </span>
  </button>

  <div
    v-show="!(position === 'side' && isCollapsed)"
    :class="['drawer-container', `pos-${position}`, { collapsed: isCollapsed }]"
    :style="containerStyle"
  >
    <div
      v-if="!isCollapsed"
      class="resize-handle"
      :title="position === 'bottom' ? 'Drag to resize height' : 'Drag to resize width'"
      @mousedown="startResize"
    >
      <div class="resize-grip"></div>
    </div>

    <div class="drawer-header" @click="toggleCollapse">
      <div class="header-left">
        <span class="terminal-title">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.4-1.4 3.1-3.1-3.1-3.1L7.5 8l4.5 4.5-4.5 4.5z"/>
          </svg>
          Console
        </span>

        <span v-if="exitCode !== null" :class="['exit-badge', exitCode === 0 ? 'success' : 'error']">
          {{ exitCode === 0 ? '0' : exitCode }}
        </span>

        <span v-if="duration" class="duration-badge">{{ duration }}ms</span>
      </div>

      <div class="header-right" @click.stop>
        <button
          class="icon-action-btn dock-btn"
          :title="position === 'bottom' ? 'Dock to right sidebar' : 'Dock to bottom'"
          @click="$emit('toggle-position')"
        >
          <svg v-if="position === 'bottom'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="15" x2="21" y2="15" />
          </svg>
        </button>

        <button
          v-if="stdout || stderr"
          class="icon-action-btn"
          :title="copied ? 'Copied to clipboard' : 'Copy console output'"
          @click="copyOutput"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>

        <button
          v-if="stdout || stderr"
          class="icon-action-btn"
          title="Clear console"
          @click="$emit('clear')"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </button>

        <button
          class="icon-action-btn collapse-toggle-btn"
          :title="isCollapsed ? 'Expand' : 'Collapse'"
          @click="toggleCollapse"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            :class="{ rotated: !isCollapsed }"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>

    <div v-show="!isCollapsed" class="drawer-body">
      <div v-if="statusMessage && !isRunning" class="status-banner">
        <span class="pulse-dot"></span> {{ statusMessage }}
      </div>

      <div v-if="isRunning" class="running-indicator">
        <span class="spinner"></span> Executing in PHP 8.5 WebAssembly...
      </div>

      <pre v-if="stdout" class="stdout-stream">{{ stdout }}</pre>
      <pre v-if="stderr" class="stderr-stream">{{ stderr }}</pre>

      <div v-if="!stdout && !stderr && !isRunning && exitCode === null" class="empty-state">
        <p class="empty-state-text">
          Click <strong>Run</strong> <span class="hide-mobile">(or press <kbd>Ctrl</kbd> + <kbd>Enter</kbd>)</span> to execute.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = withDefaults(defineProps<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: string;
  statusMessage: string;
  isRunning: boolean;
  position?: 'bottom' | 'side';
}>(), {
  position: 'bottom',
});

defineEmits<{
  (e: 'clear'): void;
  (e: 'toggle-position'): void;
}>();

const isCollapsed = ref<boolean>(false);
const drawerHeight = ref<number>(230);
const drawerWidth = ref<number>(360);
const copied = ref<boolean>(false);

const containerStyle = computed(() => {
  if (props.position === 'bottom') {
    return {
      height: isCollapsed.value ? '38px' : `${drawerHeight.value}px`,
      width: '100%',
    };
  }

  return {
    height: '100%',
    width: `${drawerWidth.value}px`,
  };
});

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value;
}

function copyOutput() {
  const fullOutput = [props.stdout, props.stderr].filter(Boolean).join('\n');
  if (!fullOutput) return;

  navigator.clipboard.writeText(fullOutput).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}

function startResize(e: MouseEvent) {
  e.preventDefault();

  if (props.position === 'bottom') {
    const startY = e.clientY;
    const startHeight = drawerHeight.value;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = startY - moveEvent.clientY;
      drawerHeight.value = Math.max(100, Math.min(window.innerHeight * 0.75, startHeight + delta));
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  } else {
    const startX = e.clientX;
    const startWidth = drawerWidth.value;

    function onMouseMove(moveEvent: MouseEvent) {
      const delta = startX - moveEvent.clientX;
      drawerWidth.value = Math.max(220, Math.min(window.innerWidth * 0.55, startWidth + delta));
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
}

defineExpose({
  expand() {
    isCollapsed.value = false;
  }
});
</script>

<style scoped>
.floating-edge-tab {
  position: absolute;
  bottom: 20px;
  right: 24px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  border: 1.5px solid var(--vp-c-brand-1);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(59, 130, 246, 0.2);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.floating-edge-tab:hover {
  background: var(--vp-c-bg-mute);
  box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);
  transform: translateY(-2px);
}

.tab-icon-wrapper {
  color: var(--vp-c-brand-1);
  display: flex;
  align-items: center;
}

.tab-label {
  font-weight: 600;
  letter-spacing: 0.2px;
}

.exit-badge-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
}

.exit-badge-pill.success {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.exit-badge-pill.error {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.tab-expand-arrow {
  display: flex;
  align-items: center;
  color: var(--vp-c-text-3);
  transition: transform 0.2s ease;
}

.floating-edge-tab:hover .tab-expand-arrow {
  color: var(--vp-c-brand-1);
  transform: translateX(-2px);
}

.drawer-container {
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg-soft);
  position: relative;
  overflow: hidden;
  transition: height 0.15s ease-out;
}

.drawer-container.pos-bottom {
  border-top: 1px solid var(--vp-c-divider);
}

.drawer-container.pos-bottom .resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 6px;
  cursor: ns-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-container.pos-bottom .resize-grip {
  width: 36px;
  height: 2px;
  border-radius: 2px;
  background: var(--vp-c-divider);
}

.drawer-container.pos-side {
  border-left: 1px solid var(--vp-c-divider);
}

.drawer-container.pos-side .resize-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drawer-container.pos-side .resize-grip {
  width: 2px;
  height: 36px;
  border-radius: 2px;
  background: var(--vp-c-divider);
}

.resize-handle:hover .resize-grip {
  background: var(--vp-c-brand-1);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 38px;
  min-height: 38px;
  background: var(--vp-c-bg-mute);
  user-select: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
  overflow: hidden;
}

.drawer-header:hover {
  background: var(--vp-c-bg-soft);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.terminal-title {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.exit-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--vp-font-family-mono);
}

.exit-badge.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.exit-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.duration-badge {
  font-size: 11px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 8px;
  flex-shrink: 0;
}

.icon-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-action-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.collapse-toggle-btn svg {
  transition: transform 0.2s ease;
}

.collapse-toggle-btn svg.rotated {
  transform: rotate(180deg);
}

.drawer-body {
  flex: 1;
  padding: 12px 14px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: var(--playground-font-size, 13px);
  line-height: 1.5;
  background: var(--vp-c-bg-soft);
}

.stdout-stream {
  color: var(--vp-c-text-1);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.stderr-stream {
  color: #f87171;
  margin: 6px 0 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(239, 68, 68, 0.08);
  padding: 10px 12px;
  border-left: 3px solid #ef4444;
  border-radius: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 60px;
  padding: 12px;
}

.empty-state-text {
  margin: 0;
  color: var(--vp-c-text-3);
  text-align: center;
  font-size: 12.5px;
  line-height: 1.5;
  font-family: var(--vp-font-family-base);
}

.empty-state-text strong {
  color: var(--vp-c-text-1);
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--vp-c-brand-1);
  background: rgba(59, 130, 246, 0.08);
  padding: 5px 10px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.running-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--vp-c-brand-1);
  margin-bottom: 8px;
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  animation: pulse 1.5s ease-in-out infinite;
}

kbd {
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 11px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }

@media (max-width: 960px) {
  .dock-btn {
    display: none !important;
  }
}

@media (max-width: 640px) {
  .hide-mobile {
    display: none !important;
  }
}
</style>