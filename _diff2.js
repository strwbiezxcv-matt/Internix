'use strict';
/* Structural diff: HEAD styles.css vs working-tree styles.css.
   Normalises whitespace and declaration order per property so only real
   differences are reported. */
const fs = require('fs');
const { execSync } = require('child_process');
const { parseRules } = require('./_audit2');

function toMap(css) {
  const rules = [];
  parseRules(css, null, rules);
  const map = new Map();
  for (const r of rules) {
    const decls = {};
    for (const part of r.decls.split(';')) {
      const idx = part.indexOf(':');
      if (idx < 1) continue;
      const prop = part.slice(0, idx).trim().toLowerCase();
      const val = part.slice(idx + 1).trim().replace(/\s+/g, ' ');
      if (prop) decls[prop] = val;
    }
    const key = (r.media ? '@' + r.media + ' ' : '') + r.selector.replace(/\s+/g, ' ');
    map.set(key, decls);
  }
  return map;
}

const head = toMap(execSync('git show HEAD:public/styles.css', { encoding: 'utf8', maxBuffer: 1e8 }));
const cur = toMap(fs.readFileSync('public/styles.css', 'utf8'));

const out = [];
const onlyCur = [...cur.keys()].filter((k) => !head.has(k));
const onlyHead = [...head.keys()].filter((k) => !cur.has(k));
out.push('HEAD selectors=' + head.size + '  CUR selectors=' + cur.size);
out.push('');
out.push('=== SELECTORS ONLY IN CURRENT (' + onlyCur.length + ') ===');
onlyCur.forEach((k) => out.push(k));
out.push('');
out.push('=== SELECTORS ONLY IN HEAD (' + onlyHead.length + ') ===');
onlyHead.forEach((k) => out.push(k));
out.push('');
out.push('=== DECLARATION CHANGES ON SHARED SELECTORS ===');
for (const k of [...cur.keys()]) {
  if (!head.has(k)) continue;
  const a = head.get(k);
  const b = cur.get(k);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const changes = [];
  for (const p of keys) {
    if ((a[p] || '') !== (b[p] || '')) changes.push('  ' + p + ': HEAD[' + (a[p] || '-') + '] -> CUR[' + (b[p] || '-') + ']');
  }
  if (changes.length) out.push(k + '\n' + changes.join('\n'));
}
fs.writeFileSync('_sdiff.out', out.join('\n'));
console.log('written _sdiff.out lines=' + out.length);