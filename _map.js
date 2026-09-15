'use strict';
const fs = require('fs');
const css = fs.readFileSync(process.argv[2], 'utf8');
const lines = css.split('\n');
const out = [];
lines.forEach((l, i) => {
  const m = l.match(/\/\*[^*]*\*\//g);
  if (m) out.push((i + 1) + ': ' + m.join(' | ').slice(0, 110));
});
// also list selector lines that start at col 0 with a specific class (blocks)
const sel = [];
lines.forEach((l, i) => {
  if (/^[.#a-zA-Z\[:][^{}]*\{\s*$/.test(l)) sel.push((i + 1) + ': ' + l.replace(/\s+/g, ' ').slice(0, 100));
});
fs.writeFileSync('_map.out', '===== COMMENTS =====\n' + out.join('\n') + '\n\n===== BLOCK SELECTORS =====\n' + sel.join('\n'));
console.log('comments=' + out.length + ' blocks=' + sel.length);
