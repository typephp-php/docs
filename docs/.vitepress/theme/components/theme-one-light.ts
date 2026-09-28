import { EditorView } from 'codemirror';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const oneLightTheme = EditorView.theme({
  '&': {
    color: '#383a42',
    backgroundColor: 'var(--vp-c-bg, #ffffff)',
  },
  '.cm-content': {
    caretColor: '#528bff',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#528bff',
  },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: '#e5e5e6 !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(0, 0, 0, 0.035)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--vp-c-bg, #ffffff)',
    color: '#9d9d9f',
    borderRight: '1px solid var(--vp-c-divider, #e2e2e3)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    color: '#383a42',
  },
}, { dark: false });

export const oneLightHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: '#a626a4', fontWeight: 'bold' },
  { tag: [t.variableName, t.definition(t.variableName)], color: '#e45649' },
  { tag: [t.propertyName], color: '#0184bc' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#4078f2' },
  { tag: [t.typeName, t.className], color: '#c18401', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: '#50a14f' },
  { tag: [t.number], color: '#986801' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: '#a0a1a7', fontStyle: 'italic' },
  { tag: [t.operator, t.punctuation], color: '#383a42' },
  { tag: [t.bool, t.null, t.constant(t.name)], color: '#986801', fontWeight: '600' },
]);

export const oneLight = [
  oneLightTheme,
  syntaxHighlighting(oneLightHighlightStyle),
];