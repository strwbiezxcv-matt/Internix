'use strict';
/* UI audit: resolves computed colors for the elements the SPA renders,
   in both themes, and flags invisible text / invisible borders. */
const fs = require('fs');
const path = require('path');

/* ------------------------------ CSS parsing ------------------------------ */
function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function parseCss(css) {
  const rules = [];
  const stack = [];
  let buf = '';
  let q = null;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (q) { buf += ch; if (ch === '\\') { buf += css[++i]; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '{') {
      const sel = buf.trim();
      buf = '';
      if (/^@(media|supports|layer)/i.test(sel)) { stack.push(sel); continue; }
      if (/^@/.test(sel)) { stack.push('@keyframes'); continue; }
      // parse declaration block
      let depth = 1, j = i + 1, q2 = null, body = '';
      for (; j < css.length; j++) {
        const c = css[j];
        if (q2) { body += c; if (c === '\\') { body += css[++j]; continue; } if (c === q2) q2 = null; continue; }
        if (c === '"' || c === "'") { q2 = c; body += c; continue; }
        if (c === '{') depth++;
        if (c === '}') { depth--; if (!depth) break; }
        body += c;
      }
      i = j;
      rules.push({ selectors: sel.split(',').map((s) => s.trim()).filter(Boolean), decls: parseDecls(body), stack: stack.slice() });
      continue;
    }
    if (ch === '}') { stack.pop(); buf = ''; continue; }
    buf += ch;
  }
  return rules;
}

function parseDecls(body) {
  const out = [];
  let buf = '';
  let q = null;
  let paren = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) { buf += ch; if (ch === '\\') { buf += body[++i]; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === ';' && !paren) {
      pushDecl(out, buf); buf = ''; continue;
    }
    buf += ch;
  }
  pushDecl(out, buf);
  return out;
}
function pushDecl(out, buf) {
  const idx = buf.indexOf(':');
  if (idx < 1) return;
  const prop = buf.slice(0, idx).trim().toLowerCase();
  const value = buf.slice(idx + 1).trim();
  if (prop && value) out.push({ prop, value });
}

/* --------------------------- selector matching --------------------------- */
function parseEl(el) {
  const tagM = /^[a-z0-9]+/i.exec(el);
  return {
    tag: tagM ? tagM[0].toLowerCase() : null,
    classes: (el.match(/\.[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1)),
    ids: (el.match(/#[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1))
  };
}
function parseCompound(c) {
  const pseudo = c.match(/:[a-z-]+(\([^)]*\))?/gi) || [];
  const rest = c.replace(/:[a-z-]+(\([^)]*\))?/gi, '');
  const e = parseEl(rest);
  e.pseudo = pseudo;
  return e;
}
const STATE_PSEUDO = /^:(hover|focus|focus-visible|active|disabled|checked|target|open|first-child|last-child|nth-child|placeholder-shown)$/i;
const ALWAYS_TRUE = /^::?(before|after|placeholder|selection|marker|first-child|last-child|nth-child|not)$/i;

function compoundMatches(comp, el, allowState) {
  const e = parseEl(el);
  if (comp.tag && comp.tag !== e.tag) return false;
  for (const c of comp.classes) if (!e.classes.includes(c)) return false;
  for (const i of comp.ids) if (!e.ids.includes(i)) return false;
  for (const p of comp.pseudo) {
    const name = p.replace(/\(.*$/, '').toLowerCase();
    if (/^:not\(/i.test(p)) {
      const inner = p.slice(5, -1).replace(/^\s*:\s*/, '').trim();
      if (inner && compoundMatches(parseCompound(inner), el, allowState)) return false;
      continue;
    }
    if (/^::/.test(p)) { if (/^::(placeholder|selection|first-line)$/i.test(p)) continue; return false; }
    if (STATE_PSEUDO.test(name)) { if (!allowState) return false; continue; }
    if (ALWAYS_TRUE.test(name)) continue;
    return false;
  }
  return true;
}
function selectorMatches(selector, chain, allowState) {
  if (/\[(hidden|open)\b/.test(selector) || /^@/.test(selector)) return false;
  const tokens = [];
  const re = /([^\s>+~]+)|([>+~])/g;
  let m;
  while ((m = re.exec(selector))) tokens.push(m[2] || m[1]);
  const compounds = [];
  const combs = [];
  for (const t of tokens) { if (t === '>' || t === '+' || t === '~') combs.push(t); else compounds.push(parseCompound(t)); }
  if (!compounds.length || !chain.length) return false;
  let ci = chain.length - 1;
  if (!compoundMatches(compounds[compounds.length - 1], chain[ci], allowState)) return false;
  let pi = compounds.length - 2;
  let k = combs.length - 1;
  while (pi >= 0) {
    const comb = combs[k] || ' ';
    let ok = false;
    if (comb === '>') {
      ci--; if (ci >= 0 && compoundMatches(compounds[pi], chain[ci], allowState)) ok = true;
    } else {
      while (ci - 1 >= 0) { ci--; if (compoundMatches(compounds[pi], chain[ci], allowState)) { ok = true; break; } }
    }
    if (!ok) return false;
    pi--; k--;
  }
  return true;
}
function specificity(sel) {
  const clean = sel.replace(/::[a-z-]+/gi, '').replace(/:[a-z-]+(\([^)]*\))?/gi, ':x');
  const ids = (clean.match(/#[A-Za-z0-9_-]+/g) || []).length;
  const cls = (clean.match(/\.[A-Za-z0-9_-]+/g) || []).length + (clean.match(/\[[^\]]+\]/g) || []).length + (clean.match(/:x/g) || []).length;
  const tags = (clean.replace(/[#.\[][^\s>+~]*/g, ' ').match(/[a-z0-9]+/gi) || []).length;
  return ids * 100 + cls * 10 + tags;
}
module.exports = { stripComments, parseCss, selectorMatches, specificity, parseEl };
