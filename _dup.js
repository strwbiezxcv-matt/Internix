'use strict';
/* Detect duplicate top-level selectors and conflicting declarations in CSS. */
const fs = require('fs');
const css = fs.readFileSync('public/styles.css', 'utf8');

// strip comments
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');

const rules = [];
let i = 0;
let buf = '';
let q = null;
let paren = 0;
let depth = 0;
while (i < clean.length) {
  const ch = clean[i];
  if (q) {
    buf += ch;
    if (ch === '\\') { buf += clean[++i]; i++; continue; }
    if (ch === q) q = null;
    i++; continue;
  }
  if (ch === '"' || ch === "'") { q = ch; buf += ch; i++; continue; }
  if (ch === '(') paren++;
  if (ch === ')') paren--;
  if (ch === '{' && paren === 0) {
    const sel = buf.trim();
    // read body until matching close brace (no nesting except @media blocks)
    let j = i + 1;
    let d = 1;
    let body = '';
    let qq = null;
    while (j < clean.length) {
      const c2 = clean[j];
      if (qq) { body += c2; if (c2 === '\\') { body += clean[++j]; } else if (c2 === qq) qq = null; j++; continue; }
      if (c2 === '"' || c2 === "'") { qq = c2; body += c2; j++; continue; }
      if (c2 === '{') { d++; body += c2; j++; continue; }
      if (c2 === '}') { d--; if (d === 0) break; body += c2; j++; continue; }
      body += c2; j++;
    }
    if (sel.startsWith('@media') || sel.startsWith('@supports')) {
      rules.push({ sel: sel, body: body, at: true });
    } else {
      rules.push({ sel: sel, body: body, at: false });
    }
    buf = '';
    i = j + 1;
    continue;
  }
  buf += ch;
  i++;
}

function decls(body) {
  const out = {};
  body.split(';').forEach((d) => {
    const k = d.indexOf(':');
    if (k < 0) return;
    const name = d.slice(0, k).trim().toLowerCase();
    const val = d.slice(k + 1).trim();
    if (name) out[name] = val;
  });
  return out;
}

// Find selectors defined multiple times at top level (non-media), with property conflicts
const map = new Map();
for (const r of rules) {
  if (r.at) continue;
  const key = r.sel.replace(/\s+/g, ' ').trim();
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(r.body);
}

let out = 'TOP-LEVEL RULE COUNT=' + rules.filter((r) => !r.at).length + '  MEDIA BLOCKS=' + rules.filter((r) => r.at).length + '\n';
out += 'DUPLICATE SELECTORS:\n';
let dupCount = 0;
for (const [sel, bodies] of map) {
  if (bodies.length < 2) continue;
  dupCount++;
  const all = bodies.map(decls);
  const props = new Set();
  all.forEach((d) => Object.keys(d).forEach((p) => props.add(p)));
  const conflicts = [];
  for (const p of props) {
    const vals = all.map((d) => d[p]).filter((v) => v !== undefined);
    if (new Set(vals).size > 1) conflicts.push(p + ' => ' + JSON.stringify(vals));
  }
  out += '  [' + bodies.length + 'x] ' + sel + (conflicts.length ? '\n      CONFLICTS: ' + conflicts.join('\n                 ') : '  (no conflicting props)') + '\n';
}
out += 'duplicate selector groups=' + dupCount + '\n';
fs.writeFileSync('_dup.out', out);
console.log('wrote _dup.out');