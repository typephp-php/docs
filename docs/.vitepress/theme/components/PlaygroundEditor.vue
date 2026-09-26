<template>
  <div class="playground-editor-wrapper">
    <div v-if="readOnly" class="xray-floating-badge">
      X-Ray View (Read-Only) — Zero Line-Drift Injected Bytecode
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
      EditorView.theme({
        '&': { height: '100%', fontSize: 'var(--playground-font-size, 13.5px)' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--vp-font-family-mono)' }
      })
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
</style>