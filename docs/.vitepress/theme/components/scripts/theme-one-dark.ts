import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const oneDarkTheme = EditorView.theme({
  '&': {
    color: '#cbd3dd',
    backgroundColor: 'var(--vp-c-bg, #1e1e20)',
  },
  '.cm-content': {
    caretColor: '#528bff',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#528bff',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#3e4451 !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vp-c-bg, #1e1e20)',
    color: '#5c6370',
    borderRight: '1px solid var(--vp-c-divider, #2e2e32)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#cbd3dd',
  },
}, { dark: true });

export const oneDarkHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.modifier], color: '#c678dd', fontWeight: 'bold' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#cbd3dd' },
  { tag: [t.propertyName], color: '#cbd3dd' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#61afef' },
  { tag: [t.typeName, t.className], color: '#e5c07b', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#98c379' },
  { tag: [t.number], color: '#d19a66' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#5c6370', fontStyle: 'italic' },
  { tag: [t.operator, t.punctuation], color: '#abb2bf' },
  { tag: [t.bool, t.null, t.constant(t.name)], color: '#d19a66', fontWeight: '600' },
]);

export const oneDark = [
  oneDarkTheme,
  syntaxHighlighting(oneDarkHighlightStyle),
];