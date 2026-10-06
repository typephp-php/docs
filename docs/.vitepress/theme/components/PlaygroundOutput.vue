<template>
  <!-- Floating tab when collapsed in side dock mode -->
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

    <span v-if="report && report.summary.total_violations > 0" class="exit-badge-pill error">
      {{ report.summary.total_violations }}
    </span>
    <span v-else-if="exitCode !== null" :class="['exit-badge-pill', exitCode === 0 ? 'success' : 'error']">
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
    <!-- Resizer Handle -->
    <div
      v-if="!isCollapsed"
      class="resize-handle"
      :title="position === 'bottom' ? 'Drag to resize height' : 'Drag to resize width'"
      @mousedown="startResize"
    >
      <div class="resize-grip"></div>
    </div>

    <!-- Drawer Header with Multi-Tabs -->
    <div class="drawer-header" @click="toggleCollapse">
      <div class="header-left" @click.stop>
        <!-- Tab 1: Terminal Console -->
        <button
          :class="['drawer-tab-btn', { active: activeTab === 'console' }]"
          @click="activeTab = 'console'"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.4-1.4 3.1-3.1-3.1-3.1L7.5 8l4.5 4.5-4.5 4.5z"/>
          </svg>
          <span>Console</span>
          <span v-if="exitCode !== null" :class="['exit-badge', exitCode === 0 ? 'success' : 'error']">
            {{ exitCode === 0 ? '0' : exitCode }}
          </span>
        </button>

        <!-- Tab 2: Audit Report -->
        <button
          v-if="report !== null || isReportModeActive"
          :class="['drawer-tab-btn', { active: activeTab === 'report' }]"
          @click="activeTab = 'report'"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          <span>Audit Report</span>
          <span v-if="totalReportViolations > 0" class="report-count-badge error">
            {{ totalReportViolations }}
          </span>
          <span v-else-if="report !== null" class="report-count-badge success">
            0
          </span>
        </button>

        <span v-if="duration && activeTab === 'console'" class="duration-badge">{{ duration }}ms</span>
      </div>

      <!-- Header Right Action Tools -->
      <div class="header-right" @click.stop>
        <!-- Dock Position Toggle -->
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

        <!-- Copy Output / Report Action -->
        <button
          v-if="(activeTab === 'console' && (stdout || stderr)) || (activeTab === 'report' && report)"
          class="icon-action-btn"
          :title="copied ? 'Copied to clipboard' : (activeTab === 'report' ? 'Copy JSON Report' : 'Copy console output')"
          @click="copyActiveContent"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10b981" stroke-width="2">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>

        <!-- Clear Action -->
        <button
          v-if="(activeTab === 'console' && (stdout || stderr)) || (activeTab === 'report' && report)"
          class="icon-action-btn"
          :title="activeTab === 'report' ? 'Clear & Delete Report' : 'Clear console'"
          @click="handleClear"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
          </svg>
        </button>

        <!-- Collapse Toggle -->
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

    <!-- Drawer Body -->
    <div v-show="!isCollapsed" class="drawer-body">
      <!-- 1. Console Stream Tab View -->
      <div v-if="activeTab === 'console'" class="console-view">
        <div v-if="isRunning" class="running-indicator">
          <span class="spinner"></span> Executing in PHP 8.5 WebAssembly...
        </div>

        <pre v-if="stdout" class="stdout-stream">{{ stdout }}</pre>
        <pre v-if="stderr" :class="['stderr-stream', { 'is-warning': isWarningOnly }]">{{ stderr }}</pre>

        <div v-if="!stdout && !stderr && !isRunning && exitCode === null" class="empty-state">
          <p class="empty-state-text">
            Click <strong>Run</strong> <span class="hide-mobile">(or press <kbd>Ctrl</kbd> + <kbd>Enter</kbd>)</span> to execute.
          </p>
        </div>
      </div>

      <!-- 2. Structured Audit Report Tab View -->
      <div v-else-if="activeTab === 'report'" class="report-view">
        <div v-if="report && report.violations && report.violations.length > 0" class="report-layout">
          <!-- Summary Header Strip with Actions -->
          <div class="report-summary-bar">
            <div class="summary-stats">
              <div class="summary-chip">
                <span class="stat-label">Total Violations:</span>
                <span class="stat-val error">{{ report.summary.total_violations }}</span>
              </div>
              <div class="summary-chip hide-mobile">
                <span class="stat-label">Files Affected:</span>
                <span class="stat-val">{{ report.summary.files_affected }}</span>
              </div>
            </div>

            <!-- Actions Cluster: Subview toggle + Copy JSON + Download JSON -->
            <div class="summary-actions">
              <!-- Cards vs JSON Toggle -->
              <div class="report-subview-toggle">
                <button
                  :class="['subview-btn', { active: reportViewMode === 'cards' }]"
                  @click="$emit('update:reportViewMode', 'cards')"
                >Cards</button>
                <button
                  :class="['subview-btn', { active: reportViewMode === 'json' }]"
                  @click="$emit('update:reportViewMode', 'json')"
                >JSON</button>
              </div>

              <!-- Dedicated Copy JSON Button -->
              <button
                :class="['report-action-btn', { success: copiedReportJson }]"
                :title="copiedReportJson ? 'JSON Copied!' : 'Copy raw JSON report'"
                @click="copyReportJson"
              >
                <svg v-if="!copiedReportJson" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#10b981" stroke-width="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span class="btn-text">{{ copiedReportJson ? 'Copied' : 'Copy JSON' }}</span>
              </button>

              <!-- Dedicated Download JSON Button -->
              <button
                class="report-action-btn"
                title="Download typephp-report.json file"
                @click="downloadReportJson"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span class="btn-text">Download</span>
              </button>
            </div>
          </div>

          <!-- Cards View -->
          <div v-if="reportViewMode === 'cards'" class="violation-cards-scroll">
            <div
              v-for="(v, idx) in report.violations"
              :key="idx"
              class="violation-card"
            >
              <div class="card-meta-line">
                <span class="badge-pill line-badge">Line {{ v.line }}</span>
                <span class="badge-pill kind-badge">{{ v.kind }}</span>
                <span class="card-target-name">{{ v.target }}</span>
                <span class="card-func-name">{{ v.function }}</span>
              </div>

              <div class="card-comparison-grid">
                <div class="comparison-item">
                  <span class="comp-label">Expected:</span>
                  <code class="comp-code expected">{{ v.expected }}</code>
                </div>
                <div class="comparison-item">
                  <span class="comp-label">Given:</span>
                  <code class="comp-code given">{{ v.given }}</code>
                </div>
              </div>

              <div class="card-message-text">
                {{ v.message }}
              </div>
            </div>
          </div>

          <!-- Raw Formatted JSON View -->
          <pre v-else class="raw-json-stream">{{ JSON.stringify(report, null, 2) }}</pre>
        </div>

        <!-- Empty Clean Report State -->
        <div v-else class="empty-report-state">
          <div class="clean-check-icon">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#10b981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <span class="clean-report-title">No Contract Violations</span>
          <p class="clean-report-desc">
            All data structures, parameter inputs, and function return boundaries satisfied their type contracts cleanly in audit mode.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { AuditReportDocument } from '../presets';

const props = withDefaults(defineProps<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
  duration: string;
  statusMessage: string;
  isRunning: boolean;
  position?: 'bottom' | 'side';
  report?: AuditReportDocument | null;
  isReportModeActive?: boolean;
  reportViewMode?: 'cards' | 'json';
}>(), {
  position: 'bottom',
  report: null,
  isReportModeActive: false,
  reportViewMode: 'cards',
});

const emit = defineEmits<{
  (e: 'clear'): void;
  (e: 'clear-report'): void;
  (e: 'toggle-position'): void;
  (e: 'update:reportViewMode', mode: 'cards' | 'json'): void;
}>();

const activeTab = ref<'console' | 'report'>('console');
const isCollapsed = ref<boolean>(false);
const drawerHeight = ref<number>(240);
const drawerWidth = ref<number>(620);
const copied = ref<boolean>(false);
const copiedReportJson = ref<boolean>(false);

const totalReportViolations = computed(() => {
  return props.report?.summary?.total_violations ?? 0;
});

const isWarningOnly = computed(() => {
  if (!props.stderr) return false;
  const text = props.stderr;
  const hasFatal =
    text.includes('Fatal error') ||
    text.includes('Parse error') ||
    text.includes('Uncaught') ||
    (props.exitCode !== null && props.exitCode !== 0);

  return (
    !hasFatal &&
    (text.includes('PHP Warning') ||
      text.includes('Warning') ||
      text.includes('Notice') ||
      text.includes('Deprecated'))
  );
});

watch(
  [() => props.isReportModeActive, () => props.report],
  ([isReportMode, newReport]) => {
    if (isReportMode && newReport && newReport.violations && newReport.violations.length > 0) {
      activeTab.value = 'report';
    } else if (!isReportMode && !newReport) {
      activeTab.value = 'console';
    }
  },
  { immediate: true }
);

watch(() => props.isRunning, (running) => {
  if (running && !props.isReportModeActive) {
    activeTab.value = 'console';
  }
});

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

function handleClear() {
  if (activeTab.value === 'report') {
    emit('clear-report');
  } else {
    emit('clear');
  }
}

function copyActiveContent() {
  let textToCopy = '';
  if (activeTab.value === 'report' && props.report) {
    textToCopy = JSON.stringify(props.report, null, 2);
  } else {
    textToCopy = [props.stdout, props.stderr].filter(Boolean).join('\n');
  }

  if (!textToCopy) return;

  navigator.clipboard.writeText(textToCopy).then(() => {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  });
}

function copyReportJson() {
  if (!props.report) return;
  const jsonString = JSON.stringify(props.report, null, 2);
  navigator.clipboard.writeText(jsonString).then(() => {
    copiedReportJson.value = true;
    setTimeout(() => {
      copiedReportJson.value = false;
    }, 2000);
  });
}

function downloadReportJson() {
  if (!props.report) return;
  const jsonString = JSON.stringify(props.report, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `typephp-report-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
      drawerWidth.value = Math.max(260, Math.min(window.innerWidth * 0.65, startWidth + delta));
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
  padding: 0 12px;
  height: 38px;
  min-height: 38px;
  background: var(--vp-c-bg-mute);
  user-select: none;
  cursor: pointer;
  border-bottom: 1px solid var(--vp-c-divider);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

/* Tab buttons inside header */
.drawer-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--vp-c-text-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.drawer-tab-btn:hover {
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
}

.drawer-tab-btn.active {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  border-color: var(--vp-c-divider);
}

.exit-badge, .report-count-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--vp-font-family-mono);
}

.exit-badge.success, .report-count-badge.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.exit-badge.error, .report-count-badge.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.duration-badge {
  font-size: 11px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  margin-left: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
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
  overflow: auto;
  font-family: var(--vp-font-family-mono);
  font-size: var(--playground-font-size, 13px);
  line-height: 1.5;
  background: var(--vp-c-bg-soft);
}

/* Console View */
.console-view {
  padding: 12px 14px;
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

/* Non-blocking PHP Warnings / Notices (Amber/Gold) */
.stderr-stream.is-warning {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.08);
  border-left: 3px solid #f59e0b;
}

:root:not(.dark) .stderr-stream.is-warning {
  color: #b45309;
  background: rgba(245, 158, 11, 0.1);
  border-left-color: #d97706;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 80px;
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

/* ========================================================
   Audit Report Layout & Cards View
   ======================================================== */
.report-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.report-layout {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px;
}

.report-summary-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-stats {
  display: flex;
  align-items: center;
  gap: 12px;
}

.summary-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
}

.stat-label {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-base);
}

.stat-val {
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
}

.stat-val.error {
  color: #ef4444;
}

/* Actions Group inside Summary Bar */
.summary-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.report-subview-toggle {
  display: inline-flex;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.subview-btn {
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 600;
  border: none;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
}

.subview-btn.active {
  background: var(--vp-c-brand-1);
  color: #fff;
}

.report-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 600;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.report-action-btn:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.report-action-btn.success {
  border-color: #10b981;
  color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}

.violation-cards-scroll {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.violation-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-left: 3px solid #ef4444;
  border-radius: 6px;
  transition: border-color 0.15s ease;
}

.violation-card:hover {
  border-color: #ef4444;
}

.card-meta-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
}

.badge-pill {
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
}

.line-badge {
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-divider);
}

.kind-badge {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
  text-transform: uppercase;
  font-size: 9.5px;
}

.card-target-name {
  font-weight: 700;
  color: var(--vp-c-brand-1);
  font-family: var(--vp-font-family-mono);
}

.card-func-name {
  font-size: 11px;
  color: var(--vp-c-text-3);
  margin-left: auto;
}

.card-comparison-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  background: var(--vp-c-bg-soft);
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
}

.comparison-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.comp-label {
  font-size: 10px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-base);
  text-transform: uppercase;
}

.comp-code {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 3px;
}

.comp-code.expected {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.comp-code.given {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.card-message-text {
  font-size: 11px;
  color: var(--vp-c-text-2);
  line-height: 1.4;
  word-break: break-word;
}

.raw-json-stream {
  margin: 0;
  padding: 10px 12px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-size: 11.5px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Empty Clean Report View */
.empty-report-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px 16px;
  text-align: center;
  gap: 8px;
}

.clean-check-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(16, 185, 129, 0.15);
}

.clean-report-title {
  font-size: 13.5px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-base);
}

.clean-report-desc {
  font-size: 11.5px;
  color: var(--vp-c-text-2);
  max-width: 380px;
  line-height: 1.5;
  margin: 0;
  font-family: var(--vp-font-family-base);
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 960px) {
  .dock-btn {
    display: none !important;
  }
}

@media (max-width: 640px) {
  .hide-mobile {
    display: none !important;
  }

  .btn-text {
    display: none;
  }

  .report-action-btn {
    padding: 2px 5px;
  }
}
</style>