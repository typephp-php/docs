function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TYPE_WORDS_REGEX = /\b(stdClass|key-of|value-of|int-mask-of|int-mask|int|string|bool|boolean|float|double|positive-int|negative-int|non-positive-int|non-negative-int|non-zero-int|unsigned-int|positive-float|negative-float|non-empty-string|numeric-string|lowercase-string|uppercase-string|non-empty-lowercase-string|non-empty-uppercase-string|class-string|interface-string|trait-string|enum-string|callable-string|literal-string|truthy-string|array-key|array|list|non-empty-array|non-empty-list|object|static-closure|static-Closure|pure-closure|pure-Closure|pure-callable|callable|closure|iterable|resource|null|true|false|mixed|void|never|self|static|\$this|[A-Z][a-zA-Z0-9_]*)\b/g;

const TAG_REGEX = /(@(?:phpstan-|psalm-)?(?:param(?:-out)?|return|var|template(?:-covariant|-contravariant)?|self-out|this-out|property(?:-read|-write)?|method|extends|implements|use|type|import-type|throws)\b)/;

interface Token {
  from: number;
  to: number;
  cls: string;
}

function addToken(tokens: Token[], from: number, to: number, cls: string): boolean {
  if (from >= to) return false;

  for (const existing of tokens) {
    if (Math.max(from, existing.from) < Math.min(to, existing.to)) {
      return false; 
    }
  }

  tokens.push({ from, to, cls });
  return true;
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
      const match = /^\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/.exec(text.slice(i));
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

function tokenizeTypeZone(offset: number, text: string, tokens: Token[]): void {
  const strRegex = /(['"])(?:\\.|[^\\])*?\1/g;
  let sm: RegExpExecArray | null;
  while ((sm = strRegex.exec(text)) !== null) {
    addToken(tokens, offset + sm.index, offset + sm.index + sm[0].length, 'tok-string');
  }

  const genericRegex = /<([^>]+)>/g;
  let gm: RegExpExecArray | null;
  while ((gm = genericRegex.exec(text)) !== null) {
    const openFrom = offset + gm.index;
    const closeTo = openFrom + gm[0].length;

    addToken(tokens, openFrom, openFrom + 1, 'tok-phpdoc-bracket');
    addToken(tokens, closeTo - 1, closeTo, 'tok-phpdoc-bracket');

    const inner = gm[1];
    const innerOffset = openFrom + 1;

    const varModRegex = /\b(covariant|contravariant|of)\b/g;
    let vm: RegExpExecArray | null;
    while ((vm = varModRegex.exec(inner)) !== null) {
      addToken(tokens, innerOffset + vm.index, innerOffset + vm.index + vm[0].length, 'tok-phpdoc-variance');
    }

    const innerWordRegex = /\b[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff\-]*\b/g;
    let im: RegExpExecArray | null;
    while ((im = innerWordRegex.exec(inner)) !== null) {
      if (im[0] !== 'covariant' && im[0] !== 'contravariant' && im[0] !== 'of') {
        addToken(tokens, innerOffset + im.index, innerOffset + im.index + im[0].length, 'tok-phpdoc-generic-type');
      }
    }
  }

  const shapeKeyRegex = /\b([a-zA-Z0-9_\-]+)(\s*\??\s*:)/g;
  let skm: RegExpExecArray | null;
  while ((skm = shapeKeyRegex.exec(text)) !== null) {
    const from = offset + skm.index;
    const keyTo = from + skm[1].length;
    const totalTo = from + skm[0].length;

    addToken(tokens, from, keyTo, 'tok-phpdoc-shape-key');
    addToken(tokens, keyTo, totalTo, 'tok-phpdoc-operator');
  }

  const numRegex = /\b\d+(?:\.\d+)?\b/g;
  let nm: RegExpExecArray | null;
  while ((nm = numRegex.exec(text)) !== null) {
    addToken(tokens, offset + nm.index, offset + nm.index + nm[0].length, 'tok-number');
  }

  const varRegex = /\$([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/g;
  let vm: RegExpExecArray | null;
  while ((vm = varRegex.exec(text)) !== null) {
    if (vm[1] !== 'this') {
      addToken(tokens, offset + vm.index, offset + vm.index + vm[0].length, 'tok-phpdoc-var');
    }
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const pos = offset + i;
    if (ch === '{' || ch === '}') {
      addToken(tokens, pos, pos + 1, 'tok-phpdoc-bracket');
    } else if (ch === '|' || ch === '&') {
      addToken(tokens, pos, pos + 1, 'tok-phpdoc-operator');
    } else if (ch === '.' && text.slice(i, i + 3) === '...') {
      addToken(tokens, pos, pos + 3, 'tok-phpdoc-operator');
      i += 2;
    }
  }

  const typeRegex = new RegExp(TYPE_WORDS_REGEX.source, 'g');
  let tm: RegExpExecArray | null;
  while ((tm = typeRegex.exec(text)) !== null) {
    const from = offset + tm.index;
    const to = from + tm[0].length;
    const isRefinement = tm[0].includes('-') && !tm[0].endsWith('-of');
    const tokenClass = isRefinement ? 'tok-phpdoc-generic-type' : 'tok-phpdoc-type';

    addToken(tokens, from, to, tokenClass);
  }
}

function processMethodDocblock(
  line: string,
  afterTagOffset: number,
  afterTagText: string,
  tokens: Token[]
): void {
  let searchOffset = 0;
  const staticMatch = /^\s+(static)\b/.exec(afterTagText);
  if (staticMatch) {
    const staticPos = afterTagText.indexOf('static');
    addToken(tokens, afterTagOffset + staticPos, afterTagOffset + staticPos + 6, 'tok-keyword');
    searchOffset = staticPos + 6;
  }

  const methodRegex = /\b([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)\s*\(/g;
  methodRegex.lastIndex = searchOffset;
  let m: RegExpExecArray | null;
  let targetMethod: { name: string; index: number } | null = null;

  while ((m = methodRegex.exec(afterTagText)) !== null) {
    if (m[1] !== 'callable' && m[1] !== 'Closure' && m[1] !== 'array' && m[1] !== 'list') {
      targetMethod = { name: m[1], index: m.index };
    }
  }

  if (!targetMethod) {
    tokenizeTypeZone(afterTagOffset, afterTagText, tokens);
    return;
  }

  const returnTypeZone = afterTagText.slice(searchOffset, targetMethod.index);
  if (returnTypeZone.trim().length > 0) {
    tokenizeTypeZone(afterTagOffset + searchOffset, returnTypeZone, tokens);
  }

  const methodFrom = afterTagOffset + targetMethod.index;
  const methodTo = methodFrom + targetMethod.name.length;
  addToken(tokens, methodFrom, methodTo, 'tok-fn');

  const openParenIndex = afterTagText.indexOf('(', targetMethod.index);
  if (openParenIndex !== -1) {
    const closeParenIndex = afterTagText.lastIndexOf(')');
    const paramsEnd = closeParenIndex !== -1 ? closeParenIndex : afterTagText.length;
    const paramsText = afterTagText.slice(openParenIndex + 1, paramsEnd);
    const paramsOffset = afterTagOffset + openParenIndex + 1;

    tokenizeTypeZone(paramsOffset, paramsText, tokens);
  }
}

function highlightDocblock(comment: string): string {
  const lines = comment.split('\n');
  const state = { braceDepth: 0, angleDepth: 0 };

  return lines.map((line) => {
    const trimmed = line.trim();

    if (trimmed === '/**' || trimmed === '*/' || trimmed === '*' || trimmed === '/*') {
      return `<span class="tok-comment">${escapeHtml(line)}</span>`;
    }

    const tokens: Token[] = [];
    const tagMatch = TAG_REGEX.exec(line);
    const isContinuationLine = /^\s*\*?\s*[|&]/.test(line);

    let typeZoneFrom = -1;
    let typeZoneTo = line.length;

    if (tagMatch) {
      addToken(tokens, tagMatch.index, tagMatch.index + tagMatch[0].length, 'tok-phpdoc-tag');
      const afterTagOffset = tagMatch.index + tagMatch[0].length;
      const afterTagText = line.slice(afterTagOffset);
      const tagName = tagMatch[0].replace(/^@(phpstan-|psalm-)?/, '');

      if (tagName === 'method') {
        processMethodDocblock(line, afterTagOffset, afterTagText, tokens);
      } else if (tagName.includes('param') || tagName === 'var' || tagName.includes('property')) {
        const outerVar = findOuterVariable(afterTagText);
        if (outerVar) {
          const varFrom = afterTagOffset + outerVar.index;
          const varTo = varFrom + outerVar.name.length;
          addToken(tokens, varFrom, varTo, 'tok-phpdoc-var');

          if (outerVar.index >= 3 && afterTagText.slice(outerVar.index - 3, outerVar.index) === '...') {
            addToken(tokens, varFrom - 3, varFrom, 'tok-phpdoc-operator');
            typeZoneFrom = afterTagOffset;
            typeZoneTo = varFrom - 3;
          } else if (outerVar.index === 0 || /^\s*$/.test(afterTagText.slice(0, outerVar.index))) {
            typeZoneFrom = varTo;
            typeZoneTo = line.length;
          } else {
            typeZoneFrom = afterTagOffset;
            typeZoneTo = varFrom;
          }
        } else {
          typeZoneFrom = afterTagOffset;
          typeZoneTo = line.length;
        }
      } else {
        typeZoneFrom = afterTagOffset;
        typeZoneTo = line.length;
      }
    } else if (isContinuationLine || state.braceDepth > 0 || state.angleDepth > 0) {
      const prefixMatch = /^(\s*\*?\s*(?:[|&]\s*)?)/.exec(line);
      typeZoneFrom = prefixMatch ? prefixMatch[0].length : 0;
      typeZoneTo = line.length;

      const varMatch = /(\$[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)$/.exec(line);
      if (varMatch) {
        addToken(tokens, varMatch.index, varMatch.index + varMatch[0].length, 'tok-phpdoc-var');
        typeZoneTo = varMatch.index;
      }
    }

    if (typeZoneFrom !== -1 && typeZoneTo > typeZoneFrom) {
      const typeText = line.slice(typeZoneFrom, typeZoneTo);
      tokenizeTypeZone(typeZoneFrom, typeText, tokens);
    }

    for (const ch of line) {
      if (ch === '{') state.braceDepth++;
      else if (ch === '}') state.braceDepth = Math.max(0, state.braceDepth - 1);
      else if (ch === '<') state.angleDepth++;
      else if (ch === '>') state.angleDepth = Math.max(0, state.angleDepth - 1);
    }

    if (tokens.length === 0) {
      return `<span class="tok-comment">${escapeHtml(line)}</span>`;
    }

    tokens.sort((a, b) => a.from - b.from || a.to - b.to);

    let html = '';
    let lastPos = 0;

    for (const token of tokens) {
      if (token.from > lastPos) {
        html += `<span class="tok-comment">${escapeHtml(line.slice(lastPos, token.from))}</span>`;
      }
      html += `<span class="${token.cls}">${escapeHtml(line.slice(token.from, token.to))}</span>`;
      lastPos = token.to;
    }

    if (lastPos < line.length) {
      html += `<span class="tok-comment">${escapeHtml(line.slice(lastPos))}</span>`;
    }

    return html;
  }).join('\n');
}

export function highlightPhp(code: string): string {
  const TOKEN_REGEX = new RegExp(
    [
      '(/\\*\\*[\\s\\S]*?\\*/|/\\*[\\s\\S]*?\\*/|//.*|#.*)',
      `('(?:\\\\.|[^'\\\\])*'|"(?:\\\\.|[^"\\\\])*")`,
      '(<\\?(?:php|=)?|\\?>)',
      '(\\$[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*)',
      '(\\b(?:declare|use|class|interface|trait|enum|extends|implements|public|protected|private|static|readonly|function|fn|return|new|if|else|elseif|isset|empty|throw|try|catch|finally|match|switch|case|break|continue|foreach|for|while|as|yield|echo|print)\\b)',
      '(\\bstdClass\\b|(?<![a-zA-Z0-9_])\\\\[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*(?:\\\\[a-zA-Z0-9_\\x7f-\\xff]+)*\\b|\\b[A-Z][a-zA-Z0-9_]*(?:\\\\[a-zA-Z0-9_]+)*\\b|\\b(?:key-of|value-of|int-mask-of|int-mask|int|string|bool|boolean|float|double|array|void|never|mixed|object|callable|iterable|true|false|null|self|parent|PHP_EOL|strict_types)\\b)',
      '(\\b[a-zA-Z_\\x7f-\\xff][a-zA-Z0-9_\\x7f-\\xff]*(?=\\s*\\())',
      '(\\b\\d+(?:\\.\\d+)?\\b)',
    ].join('|'),
    'g'
  );

  let lastIndex = 0;
  let html = '';
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(code)) !== null) {
    if (match.index > lastIndex) {
      html += escapeHtml(code.slice(lastIndex, match.index));
    }

    const [full, comment, str, phpTag, variable, keyword, typeOrClass, fnCall, number] = match;

    if (comment) {
      if (comment.startsWith('/**')) {
        html += highlightDocblock(comment);
      } else {
        html += `<span class="tok-comment">${escapeHtml(comment)}</span>`;
      }
    } else if (str) {
      html += `<span class="tok-string">${escapeHtml(str)}</span>`;
    } else if (phpTag) {
      html += `<span class="tok-php">${escapeHtml(phpTag)}</span>`;
    } else if (variable) {
      html += `<span class="tok-var">${escapeHtml(variable)}</span>`;
    } else if (keyword) {
      html += `<span class="tok-keyword">${escapeHtml(keyword)}</span>`;
    } else if (typeOrClass) {
      html += `<span class="tok-type">${escapeHtml(typeOrClass)}</span>`;
    } else if (fnCall) {
      html += `<span class="tok-fn">${escapeHtml(fnCall)}</span>`;
    } else if (number) {
      html += `<span class="tok-number">${escapeHtml(number)}</span>`;
    } else {
      html += escapeHtml(full);
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < code.length) {
    html += escapeHtml(code.slice(lastIndex));
  }

  return html;
}

export function enhanceDocblocksInDocument(): void {
  if (typeof document === 'undefined') return;

  const codeBlocks = document.querySelectorAll(
    '.vp-doc div[class*="language-php"]:not(.typephp-snippet-card *):not(.typephp-snippet-card) pre code'
  );

  codeBlocks.forEach((codeEl) => {
    if (codeEl.getAttribute('data-phpdoc-enhanced') === 'true') {
      return;
    }
    codeEl.setAttribute('data-phpdoc-enhanced', 'true');

    const lines = codeEl.querySelectorAll('.line');
    const state = { braceDepth: 0, angleDepth: 0 };
    let inDocblock = false;

    lines.forEach((line) => {
      const text = line.textContent || '';
      const trimmed = text.trim();

      if (trimmed.startsWith('/**')) {
        inDocblock = true;
      }

      if (inDocblock || trimmed.startsWith('*') || text.includes('@')) {
        const highlighted = highlightDocblock(text);
        if (highlighted !== text) {
          line.innerHTML = highlighted;
        }
      }

      if (trimmed.includes('*/')) {
        inDocblock = false;
        state.braceDepth = 0;
        state.angleDepth = 0;
      }
    });
  });
}