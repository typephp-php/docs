import { ViewPlugin, Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const tagDeco = Decoration.mark({ class: 'cm-phpdoc-tag' });
const typeDeco = Decoration.mark({ class: 'cm-phpdoc-type' });
const genericTypeDeco = Decoration.mark({ class: 'cm-phpdoc-generic-type' });
const bracketDeco = Decoration.mark({ class: 'cm-phpdoc-generic-bracket' });
const varianceDeco = Decoration.mark({ class: 'cm-phpdoc-variance' });
const varDeco = Decoration.mark({ class: 'cm-phpdoc-var' });
const shapeKeyDeco = Decoration.mark({ class: 'cm-phpdoc-shape-key' });

interface LineToken {
  from: number;
  to: number;
  deco: Decoration;
}

const TYPE_WORDS_REGEX = /\b(int|string|bool|boolean|float|double|positive-int|negative-int|non-positive-int|non-negative-int|non-zero-int|unsigned-int|positive-float|negative-float|non-empty-string|numeric-string|lowercase-string|uppercase-string|non-empty-uppercase-string|class-string|interface-string|trait-string|enum-string|callable-string|literal-string|truthy-string|array-key|array|list|non-empty-array|non-empty-list|object|callable|pure-callable|iterable|resource|null|true|false|mixed|void|never|self|static|\$this|[A-Z][a-zA-Z0-9_]*)\b/g;

const TAG_REGEX = /@(phpstan-|psalm-)?(param(?:-out)?|return|var|template(?:-covariant|-contravariant)?|self-out|this-out|property(?:-read|-write)?|method|extends|implements|use|type|import-type|throws)\b/;

function tokenizeTypeZone(startOffset: number, typeText: string, lineTokens: LineToken[]) {
  const genericRegex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;
  const genericRanges: Array<{ from: number; to: number }> = [];

  while ((match = genericRegex.exec(typeText)) !== null) {
    const openPos = startOffset + match.index;
    const closePos = openPos + match[0].length - 1;
    const inner = match[1];

    genericRanges.push({ from: openPos, to: closePos + 1 });

    lineTokens.push({ from: openPos, to: openPos + 1, deco: bracketDeco });
    lineTokens.push({ from: closePos, to: closePos + 1, deco: bracketDeco });

    const varModifierRegex = /\b(covariant|contravariant|of)\b/g;
    let vm: RegExpExecArray | null;
    while ((vm = varModifierRegex.exec(inner)) !== null) {
      lineTokens.push({
        from: openPos + 1 + vm.index,
        to: openPos + 1 + vm.index + vm[0].length,
        deco: varianceDeco,
      });
    }

    const innerWordRegex = /\b[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff\-]*\b/g;
    let im: RegExpExecArray | null;
    while ((im = innerWordRegex.exec(inner)) !== null) {
      if (im[0] !== 'covariant' && im[0] !== 'contravariant' && im[0] !== 'of') {
        lineTokens.push({
          from: openPos + 1 + im.index,
          to: openPos + 1 + im.index + im[0].length,
          deco: genericTypeDeco,
        });
      }
    }
  }

  const shapeKeyRegex = /\b([a-zA-Z0-9_\-]+)\s*\??\s*:/g;
  while ((match = shapeKeyRegex.exec(typeText)) !== null) {
    lineTokens.push({
      from: startOffset + match.index,
      to: startOffset + match.index + match[1].length,
      deco: shapeKeyDeco,
    });
  }

  let typeMatch: RegExpExecArray | null;
  const typeScanner = new RegExp(TYPE_WORDS_REGEX.source, 'g');

  while ((typeMatch = typeScanner.exec(typeText)) !== null) {
    const matchFrom = startOffset + typeMatch.index;
    const matchTo = matchFrom + typeMatch[0].length;

    const isInsideGeneric = genericRanges.some((r) => matchFrom >= r.from && matchTo <= r.to);
    if (!isInsideGeneric) {
      lineTokens.push({
        from: matchFrom,
        to: matchTo,
        deco: typeDeco,
      });
    }
  }
}

function processLine(lineFrom: number, text: string, builder: RangeSetBuilder<Decoration>, state: { bracketDepth: number }) {
  const lineTokens: LineToken[] = [];
  const tagMatch = TAG_REGEX.exec(text);

  if (tagMatch) {
    const tagIndex = tagMatch.index;
    const tagLen = tagMatch[0].length;
    const tagFrom = lineFrom + tagIndex;
    const tagTo = tagFrom + tagLen;
    const tagName = tagMatch[2];

    lineTokens.push({ from: tagFrom, to: tagTo, deco: tagDeco });

    const afterTagOffset = tagIndex + tagLen;
    const afterTagText = text.slice(afterTagOffset);

    if (tagName.includes('param') || tagName === 'var' || tagName.includes('property')) {
      const varMatch = /\$[a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*/.exec(afterTagText);

      if (varMatch) {
        const typeZoneText = afterTagText.slice(0, varMatch.index);
        tokenizeTypeZone(lineFrom + afterTagOffset, typeZoneText, lineTokens);

        const varFrom = lineFrom + afterTagOffset + varMatch.index;
        const varTo = varFrom + varMatch[0].length;
        lineTokens.push({ from: varFrom, to: varTo, deco: varDeco });
      } else {
        tokenizeTypeZone(lineFrom + afterTagOffset, afterTagText, lineTokens);
      }
    } else if (tagName === 'template' || tagName.includes('template-')) {
      const tmplMatch = /^\s+([a-zA-Z0-9_]+)(.*)$/.exec(afterTagText);
      if (tmplMatch) {
        const nameFrom = lineFrom + afterTagOffset + (tmplMatch[0].length - tmplMatch[1].length - tmplMatch[2].length);
        const nameTo = nameFrom + tmplMatch[1].length;
        lineTokens.push({ from: nameFrom, to: nameTo, deco: genericTypeDeco });

        if (tmplMatch[2]) {
          tokenizeTypeZone(lineFrom + afterTagOffset + (tmplMatch[0].length - tmplMatch[2].length), tmplMatch[2], lineTokens);
        }
      }
    } else {
      tokenizeTypeZone(lineFrom + afterTagOffset, afterTagText, lineTokens);
    }
  } else if (state.bracketDepth > 0) {
    tokenizeTypeZone(lineFrom, text, lineTokens);
  }

  for (const ch of text) {
    if (ch === '{' || ch === '<') state.bracketDepth++;
    if (ch === '}' || ch === '>') state.bracketDepth = Math.max(0, state.bracketDepth - 1);
  }

  lineTokens.sort((a, b) => a.from - b.from || a.to - b.to);

  let lastTo = 0;
  for (const token of lineTokens) {
    if (token.from >= lastTo && token.to > token.from) {
      builder.add(token.from, token.to, token.deco);
      lastTo = token.to;
    }
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  let inDocblock = false;
  const state = { bracketDepth: 0 };

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    const trimmed = text.trim();

    if (trimmed.startsWith('/**')) {
      inDocblock = true;
    }

    if (inDocblock || trimmed.startsWith('*') || text.includes('@')) {
      processLine(line.from, text, builder, state);
    }

    if (trimmed.includes('*/')) {
      inDocblock = false;
      state.bracketDepth = 0;
    }
  }

  return builder.finish();
}

export const phpdocHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: any) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);