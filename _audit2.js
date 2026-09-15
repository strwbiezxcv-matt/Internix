'use strict';
/* Static CSS cascade auditor.
   Reports rules that would make text unreadable: a `color` token whose
   contrast against the nearest ancestor-applied `background` is too low,
   evaluated separately for light and dark themes. */
const fs = require('fs');
const path = require('path');

const PUBLIC = path.join(__dirname, 'public');
const cssText = fs.readFileSync(path.join(PUBLIC, 'styles.css'), 'utf8');

/* --------------------------- tokenizer --------------------------- */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function parseRules(css, media, out) {
  css = stripComments(css);
  let i = 0;
  while (i < css.length) {
    // read selector up to { or }
    let j = i;
    let depth0 = true;
    while (j < css.length && css[j] !== '{' && css[j] !== '}') j++;
    const selectorPart = css.slice(i, j).trim();
    if (j >= css.length) break;
    if (css[j] === '}') { i = j + 1; continue; }
    // found '{'
    if (/^@media/i.test(selectorPart)) {
      const cond = selectorPart.slice(selectorPart.indexOf('(') + 1, selectorPart.lastIndexOf(')'));
      const body = readBlock(css, j);
      parseRules(body.text, cond, out);
      i = body.end;
      continue;
    }
    if (/^@/.test(selectorPart)) { const b = readBlock(css, j); i = b.end; continue; }
    const body = readBlock(css, j);
    const decls = body.text;
    for (const sel of selectorPart.split(',')) {
      const s = sel.replace(/\s+/g, ' ').trim();
      if (s) out.push({ selector: s, decls, media });
    }
    i = body.end;
  }
}

function readBlock(css, braceIdx) {
  let depth = 0;
  let i = braceIdx;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return { text: css.slice(braceIdx + 1, i - 1), end: i };
}

const rules = [];
parseRules(cssText, null, rules);
console.log('rules parsed: ' + rules.length);
module.exports = { rules, parseRules, stripComments };
