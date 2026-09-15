'use strict';
/* List every hardcoded colour literal in styles.css with rule context,
   so theme-dependent values can be converted to semantic variables. */
const fs = require('fs');
const raw = fs.readFileSync('public/styles.css', 'utf8');
const lines = raw.split(/\r?\n/);

let selector = '';
const rows = [];
let inVars = false;
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t) return;
  if (/\{$/.test(t) && !/^@/.test(t)) { selector = t.replace(/\{$/, '').trim(); inVars = /^(:root|\[data-theme)/.test(selector); }
  if (t === '}') { selector = ''; inVars = false; return; }
  const m = t.match(/(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/g);
  if (!m) return;
  if (inVars && /^--/.test(t)) return;
  rows.push({
    line: i + 1,
    sel: selector || '(top-level)',
    decl: t.replace(/;$/, ''),
    colors: m.join(' ')
  });
});

const out = rows.map((r) => String(r.line).padStart(5) + ' | ' + r.sel.slice(0, 52).padEnd(52) + ' | ' + r.decl.slice(0, 96) + '   <<< ' + r.colors);
fs.writeFileSync('_colorscan.out', 'TOTAL DECLARATIONS WITH COLOUR LITERALS: ' + rows.length + '\n\n' + out.join('\n'), 'utf8');
console.log('rows=' + rows.length + ' -> _colorscan.out');