<template>
  <div class="playground-editor-wrapper">
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

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'run'): void;
}>();

const editorContainer = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const themeCompartment = new Compartment();
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
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          emit('update:modelValue', update.state.doc.toString());
        }
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '13.5px' },
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

.code-editor-element {
  width: 100%;
  height: 100%;
}
</style>