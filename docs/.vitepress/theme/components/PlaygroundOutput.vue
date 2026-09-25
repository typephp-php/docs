<template>
  <div class="playground-output-container">
    <div class="output-tabs">
      <button
        :class="['tab-btn', { active: activeTab === 'console' }]"
        @click="activeTab = 'console'"
      >
        Console Output
        <span v-if="exitCode !== null" :class="['exit-badge', exitCode === 0 ? 'success' : 'error']">
          {{ exitCode === 0 ? 'exit: 0' : `exit: ${exitCode}` }}
        </span>
      </button>

      <button
        :class="['tab-btn', { active: activeTab === 'ast' }]"
        @click="activeTab = 'ast'"
      >
        Transformed AST Code
      </button>

      <div class="output-actions">
        <span v-if="duration" class="duration-badge">⏱ {{ duration }} ms</span>
        <button class="clear-btn" title="Clear Console" @click="$emit('clear')">Clear</button>
      </div>
    </div>

    <div v-show="activeTab === 'console'" class="console-body">
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

    <div v-show="activeTab === 'ast'" class="ast-body">
      <pre class="ast-code">{{ transformedCode || 'Click "Run" or select a preset to view AST transformed code.' }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: string;
  transformedCode: string;
  statusMessage: string;
  isRunning: boolean;
}>();

defineEmits<{
  (e: 'clear'): void;
}>();

const activeTab = ref<'console' | 'ast'>('console');
</script>

<style scoped>
.playground-output-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
}

.output-tabs {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-mute);
  padding: 0 12px;
  gap: 8px;
  min-height: 42px;
}

.tab-btn {
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-btn:hover {
  color: var(--vp-c-text-1);
}

.tab-btn.active {
  color: var(--vp-c-brand-1);
  border-bottom-color: var(--vp-c-brand-1);
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

.output-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.duration-badge {
  font-size: 12px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.clear-btn {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  color: var(--vp-c-text-2);
  cursor: pointer;
}

.clear-btn:hover {
  color: var(--vp-c-text-1);
  border-color: var(--vp-c-brand-1);
}

.console-body, .ast-body {
  flex: 1;
  padding: 16px;
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.5;
}

.stdout-stream {
  color: var(--vp-c-text-1);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.stderr-stream {
  color: #f87171;
  margin: 8px 0 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  background: rgba(239, 68, 68, 0.08);
  padding: 12px;
  border-left: 3px solid #ef4444;
  border-radius: 4px;
}

.ast-code {
  color: var(--vp-c-text-1);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
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
  margin-bottom: 12px;
}

.running-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--vp-c-brand-1);
  margin-bottom: 12px;
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