<template>
  <div class="playground-editor-wrapper">
    <div v-if="readOnly" class="xray-floating-badge">
       Zero Line-Drift Optimized Transform Code (Read-Only)
    </div>
    <div ref="editorContainer" class="code-editor-element"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { EditorView, basicSetup } from 'codemirror';
import { EditorState, Compartment } from '@codemirror/state';
import { php } from '@codemirror/lang-php';
import { oneDark } from '@codemirror/theme-one-dark';
import { keymap } from '@codemirror/view';
import { useData } from 'vitepress';
import { phpdocHighlighter } from './phpdoc-highlighter';

const props = withDefaults(defineProps<{
  modelValue: string;
  readOnly?: boolean;
  fontSize?: number;
}>(), {
  readOnly: false,
  fontSize: 13.5,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'run'): void;
}>();

const editorContainer = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const themeCompartment = new Compartment();
const readOnlyCompartment = new Compartment();
const { isDark } = useData();

const baseTheme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--playground-font-size, 13.5px)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vp-font-family-mono)' },
  '.cm-phpdoc-tag, .cm-phpdoc-tag *': { color: '#c678dd !important', fontWeight: '700 !important', fontStyle: 'normal !important' },
  '.cm-phpdoc-type, .cm-phpdoc-type *': { color: '#e5c07b !important', fontWeight: '600 !important', fontStyle: 'normal !important' },
  '.cm-phpdoc-generic-bracket, .cm-phpdoc-generic-bracket *': { color: '#e06c75 !important', fontWeight: '700 !important', fontStyle: 'normal !important' },
  '.cm-phpdoc-generic-type, .cm-phpdoc-generic-type *': { color: '#56b6c2 !important', fontStyle: 'italic !important', fontWeight: '600 !important' },
  '.cm-phpdoc-variance, .cm-phpdoc-variance *': { color: '#d19a66 !important', fontStyle: 'italic !important' },
  '.cm-phpdoc-var, .cm-phpdoc-var *': { color: '#61afef !important', fontWeight: '600 !important', fontStyle: 'normal !important' },
});

onMounted(() => {
  if (!editorContainer.value) return;

  const runKeymap = keymap.of([
    {
      key: 'Mod-Enter',
      run: () => {
        emit('run');
        return true;
      }
    }
  ]);

  const startState = EditorState.create({
    doc: props.modelValue,
    extensions: [
      basicSetup,
      php(),
      phpdocHighlighter, 
      baseTheme,
      runKeymap,
      themeCompartment.of(isDark.value ? oneDark : []),
      readOnlyCompartment.of([
        EditorState.readOnly.of(props.readOnly),
        EditorView.editable.of(!props.readOnly),
      ]),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !props.readOnly) {
          emit('update:modelValue', update.state.doc.toString());
        }
      }),
    ]
  });

  view = new EditorView({
    state: startState,
    parent: editorContainer.value
  });
});

watch(isDark, (newDark) => {
  if (view) {
    view.dispatch({
      effects: themeCompartment.reconfigure(newDark ? oneDark : [])
    });
  }
});

watch(() => props.fontSize, () => {
  if (view) {
    view.requestMeasure();
  }
});

watch(() => props.readOnly, (isReadOnly) => {
  if (view) {
    view.dispatch({
      effects: readOnlyCompartment.reconfigure([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ])
    });
  }
});

watch(() => props.modelValue, (newVal) => {
  if (view && newVal !== view.state.doc.toString()) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: newVal }
    });
  }
});

onUnmounted(() => {
  if (view) {
    view.destroy();
  }
});
</script>

<style scoped>
.playground-editor-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background-color: var(--vp-c-bg);
}

.playground-editor-wrapper :deep(.cm-editor) {
  font-size: var(--playground-font-size, 13.5px) !important;
}

.xray-floating-badge {
  position: absolute;
  top: 10px;
  right: 18px;
  z-index: 10;
  font-size: 11.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.15);
  color: var(--vp-c-brand-1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.code-editor-element {
  width: 100%;
  height: 100%;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-tag),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-tag) * {
  color: #7c3aed !important;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-type),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-type) * {
  color: #b45309 !important;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-generic-bracket),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-generic-bracket) * {
  color: #e11d48 !important;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-generic-type),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-generic-type) * {
  color: #0891b2 !important;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-variance),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-variance) * {
  color: #ea580c !important;
}

:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-var),
:root:not(.dark) .playground-editor-wrapper :deep(.cm-phpdoc-var) * {
  color: #2563eb !important;
}

@media (max-width: 768px) {
  .your-badge-class-name {
    display: none !important;
  }
}
</style>