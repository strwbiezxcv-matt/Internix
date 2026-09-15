'use strict';
/* Audits hardcoded colors in styles.css (outside the variable-definition blocks)
   so every dark-mode leak can be found. */
const fs = require('fs');
const file = process.argv[2] || 'public/styles.css';
const css = fs.readFileSync(file, 'utf8');

const lines = css.split('\n');
let inVars = 0;
const hits = [];
let selectorStack = '';

lines.forEach((raw, i) => {
  const line = raw.trim();
  const ln = i + 1;
  // Track whether we're inside :root / [data-theme] variable blocks
  if (/^:root\s*\{/.test(line) || /^\[data-theme=/.test(line)) { inVars++; }
  if (inVars > 0 && line.includes('}')) { inVars--; }

  // remember nearest selector
  if (/[,{]$/.test(line) && !line.startsWith('--') && !/color|background|padding|margin/.test(line)) {
    selectorStack = line;
  }
  // only look at declarations
  const m = line.match(/^([a-z-]+)\s*:\s*(.+?);?$/);
  if (!m) return;
  const prop = m[1];
  const val = m[2];
  if (!/color|background|border|shadow|outline|fill|stroke/.test(prop)) return;
  if (!/#[0-9a-fA-F]{3,8}|rgba?\(/.test(val)) return;
  if (inVars > 0) return;
  if (/var\(--/.test(val)) return; // fine: themed
  hits.push(ln + ' | ' + prop + ': ' + val.replace(/\s+/g, ' ').slice(0, 120));
});

fs.writeFileSync('_colors.out', 'HARDCODED COLOR DECLARATIONS OUTSIDE VAR BLOCKS: ' + hits.length + '\n' + hits.join('\n'));
console.log('hits=' + hits.length);