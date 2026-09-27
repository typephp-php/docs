<template>
  <transition name="fade">
    <div v-if="!isReady && !initError" class="editor-loading-overlay">
      <div class="loading-card">
        <span class="loading-spinner"></span>
        <div class="loading-text">
          <span class="loading-title">Initializing PHP 8.5 WebAssembly</span>
          <span class="loading-status">{{ status }}</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
defineProps<{
  isReady: boolean;
  initError: boolean;
  status: string;
}>();
</script>

<style scoped>
.editor-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(5px);
  pointer-events: all;
}

.loading-card {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 24px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.loading-spinner {
  width: 22px;
  height: 22px;
  border: 2.5px solid rgba(59, 130, 246, 0.2);
  border-top-color: var(--vp-c-brand-1);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.loading-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.loading-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.loading-status {
  font-size: 11px;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>