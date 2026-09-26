<template>
  <div
    class="drawer-container"
    :style="{ height: isCollapsed ? '42px' : `${drawerHeight}px` }"
  >
    <div
      v-if="!isCollapsed"
      class="resize-handle"
      title="Drag to resize terminal height"
      @mousedown="startResize"
    >
      <div class="resize-grip"></div>
    </div>

    <div
      class="drawer-header"
      :title="isCollapsed ? 'Click to expand terminal' : 'Click to collapse terminal'"
      @click="toggleCollapse"
    >
      <div class="header-left">
        <span class="terminal-title">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.4-1.4 3.1-3.1-3.1-3.1L7.5 8l4.5 4.5-4.5 4.5z"/>
          </svg>
          Console Output
        </span>

        <span class="collapse-hint">
          {{ isCollapsed ? '(Click to expand ▴)' : '(Click to collapse ▾)' }}
        </span>

        <span v-if="exitCode !== null" :class="['exit-badge', exitCode === 0 ? 'success' : 'error']">
          {{ exitCode === 0 ? 'exit: 0' : `exit: ${exitCode}` }}
        </span>

        <span v-if="duration" class="duration-badge">⏱ {{ duration }} ms</span>
      </div>

      <div class="header-right" @click.stop>
        <button
          v-if="stdout || stderr"
          class="terminal-action-btn"
          title="Copy Console Output"
          @click="copyOutput"
        >
          {{ copied ? 'Copied!' : 'Copy Output' }}
        </button>

        <button
          v-if="stdout || stderr"
          class="terminal-action-btn"
          title="Clear Console"
          @click="$emit('clear')"
        >
          Clear
        </button>

        <button
          class="terminal-action-btn collapse-btn"
          :title="isCollapsed ? 'Expand Terminal' : 'Collapse Terminal'"
          @click="toggleCollapse"
        >
          {{ isCollapsed ? 'Expand ▴' : 'Collapse ▾' }}
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
        Click <strong>Run Code</strong> (or press <kbd>Ctrl</kbd> + <kbd>Enter</kbd>) to execute with TypePHP.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: string;
  statusMessage: string;
  isRunning: boolean;
}>();

defineEmits<{
  (e: 'clear'): void;
}>();

const isCollapsed = ref<boolean>(false);
const drawerHeight = ref<number>(240);
const copied = ref<boolean>(false);

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
  const startY = e.clientY;
  const startHeight = drawerHeight.value;

  function onMouseMove(moveEvent: MouseEvent) {
    const delta = startY - moveEvent.clientY;
    const newHeight = Math.max(120, Math.min(window.innerHeight * 0.75, startHeight + delta));
    drawerHeight.value = newHeight;
  }

  function onMouseUp() {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  }

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

defineExpose({
  expand() {
    isCollapsed.value = false;
  }
});
</script>

<style scoped>
.drawer-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  background: var(--vp-c-bg-soft);
  border-top: 1px solid var(--vp-c-divider);
  position: relative;
  transition: height 0.15s ease-out;
  overflow: hidden;
}

.resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 8px;
  cursor: ns-resize;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

.resize-grip {
  width: 44px;
  height: 3px;
  border-radius: 2px;
  background: var(--vp-c-divider);
  transition: all 0.2s ease;
}

.resize-handle:hover .resize-grip {
  background: var(--vp-c-brand-1);
  width: 60px;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  height: 42px;
  min-height: 42px;
  background: var(--vp-c-bg-mute);
  user-select: none;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.drawer-header:hover {
  background: var(--vp-c-bg-soft);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.terminal-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.collapse-hint {
  font-size: 11px;
  color: var(--vp-c-text-3);
  transition: color 0.2s ease;
}

.drawer-header:hover .collapse-hint {
  color: var(--vp-c-brand-1);
}

.exit-badge {
  font-size: 10.5px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
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
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.terminal-action-btn {
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 9px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 5px;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.terminal-action-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.collapse-btn {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-mute);
}

.drawer-body {
  flex: 1;
  padding: 14px 18px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: var(--playground-font-size, 13px);
  line-height: 1.55;
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
  padding: 10px 14px;
  border-left: 3px solid #ef4444;
  border-radius: 4px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--vp-c-text-3);
  text-align: center;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--vp-c-brand-1);
  background: rgba(59, 130, 246, 0.08);
  padding: 6px 12px;
  border-radius: 4px;
  margin-bottom: 10px;
}

.running-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--vp-c-brand-1);
  margin-bottom: 10px;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(59, 130, 246, 0.3);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.pulse-dot {
  width: 8px;
  height: 8px;
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

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}
</style>