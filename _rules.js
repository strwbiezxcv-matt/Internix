'use strict';
/* List every top-level rule with its line number so duplicated/conflicting
   selectors in public/styles.css can be spotted quickly. */
const fs = require('fs');
const file = process.argv[2] || 'public/styles.css';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const filter = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
const out = [];
let depth = 0;
let cur = null;
lines.forEach((line, i) => {
  const opens = (line.match(/\{/g) || []).length;
  const closes = (line.match(/\}/g) || []).length;
  if (depth === 0 && opens > 0) {
    cur = { line: i + 1, sel: line.replace(/\{$/, '').trim(), body: [] };
  } else if (depth > 0 && cur && !/^\s*$/.test(line)) {
    cur.body.push(line.trim());
  }
  depth += opens - closes;
  if (depth === 0 && cur) {
    if (!filter || filter.test(cur.sel)) out.push(cur);
    cur = null;
  }
});
out.forEach((r) => {
  console.log(String(r.line).padStart(5) + '  ' + r.sel);
});
console.log('--- matched rules: ' + out.length + ' ---');