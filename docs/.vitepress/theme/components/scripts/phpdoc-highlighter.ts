import { ViewPlugin, Decoration, DecorationSet, EditorView } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

const tagDeco = Decoration.mark({ class: 'cm-phpdoc-tag' });
const typeDeco = Decoration.mark({ class: 'cm-phpdoc-type' });
const primitiveDeco = Decoration.mark({ class: 'cm-phpdoc-primitive' });
const genericTypeDeco = Decoration.mark({ class: 'cm-phpdoc-generic-type' });
const bracketDeco = Decoration.mark({ class: 'cm-phpdoc-generic-bracket' });
const varianceDeco = Decoration.mark({ class: 'cm-phpdoc-variance' });
const varDeco = Decoration.mark({ class: 'cm-phpdoc-var' });
const shapeKeyDeco = Decoration.mark({ class: 'cm-phpdoc-shape-key' });
const stringDeco = Decoration.mark({ class: 'cm-phpdoc-string' });
const operatorDeco = Decoration.mark({ class: 'cm-phpdoc-operator' });
const numberDeco = Decoration.mark({ class: 'cm-phpdoc-number' });
const classDeco = Decoration.mark({ class: 'cm-php-class' });
const methodDeco = Decoration.mark({ class: 'cm-php-method' });
const funcDeco = Decoration.mark({ class: 'cm-php-func' });
const thisDeco = Decoration.mark({ class: 'cm-php-this' });
const selfStaticDeco = Decoration.mark({ class: 'cm-php-self-static' });
const propertyDeco = Decoration.mark({ class: 'cm-php-property' });

interface LineToken {
  from: number;
  to: number;
  deco: Decoration;
}

const PRIMITIVES_SET = new Set([
  'int', 'integer', 'string', 'bool', 'boolean', 'float', 'double',
  'mixed', 'void', 'never', 'resource', 'callable', 'pure-callable',
  'closure', 'Closure', 'pure-closure', 'pure-Closure', 'static-closure', 'static-Closure',
  'null', 'true', 'false', 'iterable'
]);

const CONTAINERS_SET = new Set([
  'array', 'list', 'non-empty-array', 'non-empty-list', 'object'
]);

const TYPE_WORDS_REGEX = /\b(stdClass|key-of|value-of|int-mask-of|int-mask|int|string|bool|boolean|float|double|positive-int|negative-int|non-positive-int|non-negative-int|non-zero-int|unsigned-int|positive-float|negative-float|non-empty-string|numeric-string|lowercase-string|uppercase-string|non-empty-lowercase-string|non-empty-uppercase-string|class-string|interface-string|trait-string|enum-string|callable-string|literal-string|truthy-string|array-key|array|list|non-empty-array|non-empty-list|object|static-closure|static-Closure|pure-closure|pure-Closure|pure-callable|callable|closure|iterable|resource|null|true|false|mixed|void|never|self|static|[A-Z][a-zA-Z0-9_]*)\b/g;

const TAG_REGEX = /@(typephp-[a-zA-Z0-9_-]+|(?:phpstan-|psalm-)?(?:param(?:-out)?|return|var|template(?:-covariant|-contravariant)?|self-out|this-out|property(?:-read|-write)?|method|extends|implements|use|type|import-type|throws))\b/;

const PHP_KEYWORDS = new Set([
  'if', 'elseif', 'else', 'while', 'for', 'foreach', 'as', 'switch', 'case', 'break',
  'continue', 'return', 'throw', 'try', 'catch', 'finally', 'declare', 'function', 'fn',
  'class', 'interface', 'trait', 'enum', 'extends', 'implements', 'use', 'new', 'clone',
  'echo', 'print', 'include', 'include_once', 'require', 'require_once', 'isset', 'empty',
  'unset', 'eval', 'exit', 'die', 'match', 'yield', 'array', 'list'
]);

function getIgnoredCodeRanges(text: string): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];
    const next = text[i + 1];

    if ((ch === '/' && next === '/') || ch === '#') {
      ranges.push({ from: i, to: len });
      break;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      while (i < len) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      ranges.push({ from: start, to: i });
      continue;
    }

    i++;
  }

  return ranges;
}

function isInsideIgnored(from: number, to: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((r) => from >= r.from && to <= r.to);
}

function findOuterVariable(text: string): { index: number; name: string } | null {
  let parenDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') parenDepth++;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '{') braceDepth++;
    else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === '<') angleDepth++;
    else if (ch === '>') angleDepth = Math.max(0, angleDepth - 1);
    else if (ch === '$' && parenDepth === 0 && braceDepth === 0 && angleDepth === 0) {
      const match = /^\$([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)/.exec(text.slice(i));
      if (match) {
        if (match[1] === 'this') {
          continue;
        }
        return { index: i, name: match[0] };
      }
    }
  }
  return null;
}

function tokenizeTypeZone(startOffset: number, typeText: string, lineTokens: LineToken[]) {
  const strRegex = /(['"])(?:\\.|[^\\])*?\1/g;
  let sm: RegExpExecArray | null;
  while ((sm = strRegex.exec(typeText)) !== null) {
    lineTokens.push({
      from: startOffset + sm.index,
      to: startOffset + sm.index + sm[0].length,
      deco: stringDeco,
    });
  }

  const shapeKeyRegex = /\b([a-zA-Z0-9_\-]+)\s*\??\s*:/g;
  let skm: RegExpExecArray | null;
  while ((skm = shapeKeyRegex.exec(typeText)) !== null) {
    lineTokens.push({
      from: startOffset + skm.index,
      to: startOffset + skm.index + skm[1].length,
      deco: shapeKeyDeco,
    });
  }

  const numRegex = /\b\d+(?:\.\d+)?\b/g;
  let nm: RegExpExecArray | null;
  while ((nm = numRegex.exec(typeText)) !== null) {
    lineTokens.push({
      from: startOffset + nm.index,
      to: startOffset + nm.index + nm[0].length,
      deco: numberDeco,
    });
  }

  const varRegex = /\$([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)/g;
  let vrm: RegExpExecArray | null;
  while ((vrm = varRegex.exec(typeText)) !== null) {
    if (vrm[0] === '$this') {
      lineTokens.push({
        from: startOffset + vrm.index,
        to: startOffset + vrm.index + 5,
        deco: thisDeco,
      });
    } else {
      lineTokens.push({
        from: startOffset + vrm.index,
        to: startOffset + vrm.index + vrm[0].length,
        deco: varDeco,
      });
    }
  }

  for (let i = 0; i < typeText.length; i++) {
    const ch = typeText[i];
    const pos = startOffset + i;
    const prev = i > 0 ? typeText[i - 1] : '';

    if (ch === '{' || ch === '}') {
      lineTokens.push({ from: pos, to: pos + 1, deco: bracketDeco });
    } else if (ch === '<') {
      lineTokens.push({ from: pos, to: pos + 1, deco: bracketDeco });
    } else if (ch === '>') {
      if (prev !== '-' && prev !== '=') {
        lineTokens.push({ from: pos, to: pos + 1, deco: bracketDeco });
      }
    } else if (ch === '|' || ch === '&') {
      lineTokens.push({ from: pos, to: pos + 1, deco: operatorDeco });
    } else if (ch === '.' && typeText.slice(i, i + 3) === '...') {
      lineTokens.push({ from: pos, to: pos + 3, deco: operatorDeco });
      i += 2;
    } else if (ch === ',' || ch === ':') {
      lineTokens.push({ from: pos, to: pos + 1, deco: operatorDeco });
    }
  }

  const varModifierRegex = /\b(covariant|contravariant|of)\b/g;
  let vmm: RegExpExecArray | null;
  while ((vmm = varModifierRegex.exec(typeText)) !== null) {
    lineTokens.push({
      from: startOffset + vmm.index,
      to: startOffset + vmm.index + vmm[0].length,
      deco: varianceDeco,
    });
  }

  const typeScanner = new RegExp(TYPE_WORDS_REGEX.source, 'g');
  let tm: RegExpExecArray | null;
  while ((tm = typeScanner.exec(typeText)) !== null) {
    const word = tm[0];
    const matchFrom = startOffset + tm.index;
    const matchTo = matchFrom + word.length;

    if (word === 'covariant' || word === 'contravariant' || word === 'of') {
      continue;
    }

    let deco = typeDeco;
    if (CONTAINERS_SET.has(word)) {
      deco = typeDeco;
    } else if (PRIMITIVES_SET.has(word)) {
      deco = primitiveDeco;
    } else if (word.includes('-') && !word.endsWith('-of')) {
      deco = genericTypeDeco;
    } else if (/^(?:[A-Z]|T[A-Z][a-zA-Z0-9_]*)$/.test(word)) {
      deco = genericTypeDeco;
    }

    lineTokens.push({ from: matchFrom, to: matchTo, deco }); 
  }
}

function processMethodDocblock(baseOffset: number, afterTagText: string, lineTokens: LineToken[]) {
  let searchOffset = 0;
  const staticMatch = /^\s+(static)\b/.exec(afterTagText);
  if (staticMatch) {
    const staticPos = afterTagText.indexOf('static');
    lineTokens.push({
      from: baseOffset + staticPos,
      to: baseOffset + staticPos + 6,
      deco: selfStaticDeco
    });
    searchOffset = staticPos + 6;
  }

  const methodRegex = /\b([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\s*\(/g;
  methodRegex.lastIndex = searchOffset;
  let m: RegExpExecArray | null;
  let targetMethod: { name: string; index: number } | null = null;

  while ((m = methodRegex.exec(afterTagText)) !== null) {
    if (m[1] !== 'callable' && m[1] !== 'Closure' && m[1] !== 'array' && m[1] !== 'list') {
      targetMethod = { name: m[1], index: m.index };
    }
  }

  if (!targetMethod) {
    tokenizeTypeZone(baseOffset, afterTagText, lineTokens);
    return;
  }

  const returnTypeZone = afterTagText.slice(searchOffset, targetMethod.index);
  if (returnTypeZone.trim().length > 0) {
    tokenizeTypeZone(baseOffset + searchOffset, returnTypeZone, lineTokens);
  }

  const methodFrom = baseOffset + targetMethod.index;
  const methodTo = methodFrom + targetMethod.name.length;
  lineTokens.push({ from: methodFrom, to: methodTo, deco: methodDeco });

  const openParenIndex = afterTagText.indexOf('(', targetMethod.index);
  if (openParenIndex !== -1) {
    const closeParenIndex = afterTagText.lastIndexOf(')');
    const paramsEnd = closeParenIndex !== -1 ? closeParenIndex : afterTagText.length;
    const paramsText = afterTagText.slice(openParenIndex + 1, paramsEnd);
    const paramsOffset = baseOffset + openParenIndex + 1;

    tokenizeTypeZone(paramsOffset, paramsText, lineTokens);
  }
}

function tokenizePhpCode(lineFrom: number, text: string, lineTokens: LineToken[]) {
  const ignored = getIgnoredCodeRanges(text);
  let match: RegExpExecArray | null;

  const methodCallRegex = /(?:->|\?->)\s*([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\s*(?=\(|\.\.\.)/g;
  while ((match = methodCallRegex.exec(text)) !== null) {
    const name = match[1];
    const from = lineFrom + match.index + match[0].indexOf(name);
    const to = from + name.length;
    if (!isInsideIgnored(from - lineFrom, to - lineFrom, ignored)) {
      lineTokens.push({ from, to, deco: methodDeco });
    }
  }

  const staticMethodRegex = /::\s*([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\s*(?=\(|\.\.\.)/g;
  while ((match = staticMethodRegex.exec(text)) !== null) {
    const name = match[1];
    const from = lineFrom + match.index + match[0].indexOf(name);
    const to = from + name.length;
    if (!isInsideIgnored(from - lineFrom, to - lineFrom, ignored)) {
      lineTokens.push({ from, to, deco: methodDeco });
    }
  }

  const propertyAccessRegex = /(?:->|\?->)\s*([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\b(?!\s*(\(|\.\.\.))/g;
  while ((match = propertyAccessRegex.exec(text)) !== null) {
    const propName = match[1];
    const from = lineFrom + match.index + match[0].indexOf(propName);
    const to = from + propName.length;
    if (!isInsideIgnored(from - lineFrom, to - lineFrom, ignored)) {
      lineTokens.push({ from, to, deco: propertyDeco });
    }
  }

  const propDeclRegex = /(?:public|protected|private|var)\s+(?:(?:static|readonly)\s+)?(?:(?!function\b)[a-zA-Z0-9_\\|\&<>\?,\s]+\s+)?\$([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\b/g;
  while ((match = propDeclRegex.exec(text)) !== null) {
    const propName = match[1];
    const varWithDollar = '$' + propName;
    const startOffset = match[0].lastIndexOf(varWithDollar);
    if (startOffset !== -1) {
      const from = lineFrom + match.index + startOffset;
      const to = from + varWithDollar.length;
      if (!isInsideIgnored(from - lineFrom, to - lineFrom, ignored)) {
        lineTokens.push({ from, to, deco: propertyDeco });
      }
    }
  }

  const thisRegex = /(?<![a-zA-Z0-9_])\$this\b/g;
  while ((match = thisRegex.exec(text)) !== null) {
    const from = lineFrom + match.index;
    const to = from + 5;
    if (!isInsideIgnored(match.index, match.index + 5, ignored)) {
      lineTokens.push({ from, to, deco: thisDeco });
    }
  }

  const selfStaticRegex = /\b(self|static|parent)\b/g;
  while ((match = selfStaticRegex.exec(text)) !== null) {
    const word = match[1];
    const startPos = match.index;
    const from = lineFrom + startPos;
    const to = from + word.length;
    if (isInsideIgnored(startPos, startPos + word.length, ignored)) {
      continue;
    }
    const prevChar = startPos > 0 ? text[startPos - 1] : '';
    const twoCharsBefore = startPos > 1 ? text.slice(startPos - 2, startPos) : '';
    if (twoCharsBefore === '->' || twoCharsBefore === '?->' || prevChar === '$') {
      continue;
    }
    lineTokens.push({ from, to, deco: selfStaticDeco });
  }

  const classRegex = /\b([A-Z][a-zA-Z0-9_]*|stdClass)\b/g;
  while ((match = classRegex.exec(text)) !== null) {
    const word = match[1];
    const startPos = match.index;
    const from = lineFrom + startPos;
    const to = from + word.length;

    if (isInsideIgnored(startPos, startPos + word.length, ignored)) {
      continue;
    }

    if (word.length > 1 && word === word.toUpperCase() && word.includes('_')) {
      continue;
    }

    const prevChar = startPos > 0 ? text[startPos - 1] : '';
    const twoCharsBefore = startPos > 1 ? text.slice(startPos - 2, startPos) : '';
    if (twoCharsBefore === '->' || twoCharsBefore === '::' || prevChar === '$') {
      continue;
    }

    lineTokens.push({ from, to, deco: classDeco });
  }

  const funcCallRegex = /\b([a-zA-Z_\x80-\xff][a-zA-Z0-9_\x80-\xff]*)\s*(?=\(|\.\.\.)/g;
  while ((match = funcCallRegex.exec(text)) !== null) {
    const fnName = match[1];
    const startPos = match.index;
    const from = lineFrom + startPos;
    const to = from + fnName.length;

    if (isInsideIgnored(startPos, startPos + fnName.length, ignored)) {
      continue;
    }

    if (PHP_KEYWORDS.has(fnName)) {
      continue;
    }

    const twoCharsBefore = startPos > 1 ? text.slice(startPos - 2, startPos) : '';
    const threeCharsBefore = startPos > 2 ? text.slice(startPos - 3, startPos) : '';
    if (twoCharsBefore === '->' || twoCharsBefore === '::' || threeCharsBefore === '?->') {
      continue;
    }

    const isAlreadyClass = lineTokens.some((t) => t.from === from && t.to === to && t.deco === classDeco);
    if (!isAlreadyClass) {
      lineTokens.push({ from, to, deco: funcDeco });
    }
  }
}

function processDocblockLine(lineFrom: number, text: string, lineTokens: LineToken[], state: { bracketDepth: number }) {
  const tagMatch = TAG_REGEX.exec(text);

  if (tagMatch) {
    const tagIndex = tagMatch.index;
    const tagLen = tagMatch[0].length;
    const tagFrom = lineFrom + tagIndex;
    const tagTo = tagFrom + tagLen;
    const tagName = tagMatch[1].replace(/^(typephp-|phpstan-|psalm-)/, '');

    lineTokens.push({ from: tagFrom, to: tagTo, deco: tagDeco });

    const afterTagOffset = tagIndex + tagLen;
    const afterTagText = text.slice(afterTagOffset);

    if (tagName === 'method') {
      processMethodDocblock(lineFrom + afterTagOffset, afterTagText, lineTokens);
    } else if (tagName.includes('param') || tagName === 'var' || tagName.includes('property')) {
      const outerVar = findOuterVariable(afterTagText);
      if (outerVar) {
        const varFrom = lineFrom + afterTagOffset + outerVar.index;
        const varTo = varFrom + outerVar.name.length;
        lineTokens.push({ from: varFrom, to: varTo, deco: varDeco });

        if (outerVar.index >= 3 && afterTagText.slice(outerVar.index - 3, outerVar.index) === '...') {
          lineTokens.push({ from: varFrom - 3, to: varFrom, deco: operatorDeco });
          tokenizeTypeZone(lineFrom + afterTagOffset, afterTagText.slice(0, outerVar.index - 3), lineTokens);
        } else if (outerVar.index === 0 || /^\s*$/.test(afterTagText.slice(0, outerVar.index))) {
          tokenizeTypeZone(varTo, afterTagText.slice(outerVar.index + outerVar.name.length), lineTokens);
        } else {
          tokenizeTypeZone(lineFrom + afterTagOffset, afterTagText.slice(0, outerVar.index), lineTokens);
        }
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
    const lineTokens: LineToken[] = [];

    if (trimmed.startsWith('/**')) {
      inDocblock = true;
    }

    if (inDocblock || trimmed.startsWith('*') || text.includes('@')) {
      processDocblockLine(line.from, text, lineTokens, state);
    } else {
      tokenizePhpCode(line.from, text, lineTokens);
    }

    if (trimmed.includes('*/')) {
      inDocblock = false;
      state.bracketDepth = 0;
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