'use strict';
/* Report nesting depth per rule so flattened/patched CSS can be audited. */
const fs = require('fs');
const css = fs.readFileSync('public/styles.css', 'utf8');
const lines = css.split('\n');
let depth = 0;
const out = [];
lines.forEach((l, i) => {
  const n = i + 1;
  const opens = (l.match(/\{/g) || []).length;
  const closes = (l.match(/\}/g) || []).length;
  const before = depth;
  depth += opens - closes;
  const sel = l.trim();
  if (opens && depth === 0) out.push('DEPTH-0-BUG L' + n + ': ' + sel.slice(0, 80));
  if (before > 0 || opens) out.push('L' + n + ' d' + before + '->' + depth + ' | ' + sel.slice(0, 110));
});
const aux = [];
aux.push('final depth=' + depth);
aux.push('=== rules mentioning label / field / filter (with depth) ===');
out.filter((l) => /label|\.field|filter-bar|^L\d+ d\d+->\d+ \| (input|select)/i.test(l)).forEach((l) => aux.push(l));
fs.writeFileSync('_depth.out', aux.join('\n'), 'utf8');
console.log('ok');