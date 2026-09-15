'use strict';
/* Contrast + layout auditor for the Internix front end.
   Parses public/styles.css, resolves var() chains for :root and
   [data-theme="dark"], and checks text/background contrast for every rule
   that sets a colour, plus a few layout heuristics. */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const CSS = fs.readFileSync(path.join(ROOT, 'public/styles.css'), 'utf8');

/* ------------------------------- css parse ------------------------------- */

function stripComments(css) {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end === -1 ? css.length : end + 2;
      out += ' ';
      continue;
    }
    out += css[i];
    i++;
  }
  return out;
}

const CLEAN = stripComments(CSS);

function splitBlocks(css) {
  const rules = [];
  let i = 0;
  let buf = '';
  while (i < css.length) {
    const ch = css[i];
    if (ch === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++;
        else if (css[j] === '}') depth--;
        j++;
      }
      const body = css.slice(i + 1, j - 1);
      const prelude = buf.trim();
      buf = '';
      if (depth === 0 && /^@media/i.test(prelude)) {
        for (const inner of splitBlocks(body)) {
          inner.media = prelude.replace(/\s+/g, ' ');
          rules.push(inner);
        }
      } else if (depth === 0 && /^@/.test(prelude)) {
        rules.push({ selector: prelude, body, media: null, atRule: true });
      } else {
        rules.push({ selector: prelude, body, media: null, atRule: false });
      }
      i = j;
    } else {
      buf += ch;
      i++;
    }
  }
  return rules;
}

const RULES = splitBlocks(CLEAN);

function declarations(body) {
  const decls = [];
  let depth = 0;
  let q = null;
  let buf = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) {
      buf += ch;
      if (ch === '\\') { buf += body[++i]; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { decls.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) decls.push(buf);
  return decls.map((d) => {
    const idx = d.indexOf(':');
    if (idx < 0) return null;
    return { prop: d.slice(0, idx).trim().toLowerCase(), value: d.slice(idx + 1).trim() };
  }).filter(Boolean);
}

/* ------------------------------ variables ------------------------------ */

function collectVars(filter) {
  const vars = {};
  for (const r of RULES) {
    if (r.atRule || !r.selector) continue;
    if (!filter(r.selector)) continue;
    for (const d of declarations(r.body)) {
      if (d.prop.startsWith('--')) vars[d.prop] = d.value;
    }
  }
  return vars;
}

const LIGHT = collectVars((s) => /^:root/.test(s.trim()));
const DARK = collectVars((s) => /\[data-theme=['"]?dark/.test(s));

function resolve(value, vars, chain) {
  chain = chain || [];
  if (!value) return value;
  return value.replace(/var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^)]*))?\)/g, (m, name, fb) => {
    if (chain.includes(name)) return fb || '';
    const v = vars[name] !== undefined ? vars[name] : (fb !== undefined ? fb : undefined);
    if (v === undefined) return m;
    return resolve(v.trim(), vars, chain.concat(name));
  });
}

/* colours */

const NAMED = {
  white: [255, 255, 255], black: [0, 0, 0],
  red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], gray: [128, 128, 128],
  grey: [128, 128, 128], silver: [192, 192, 192]
};

function parseColor(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (Object.prototype.hasOwnProperty.call(NAMED, s.toLowerCase())) return NAMED[s.toLowerCase()];
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h = h + 'ff';
    if (h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16) / 255];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter((x) => x !== '');
    const num = (x) => (String(x).endsWith('%') ? parseFloat(x) * 2.55 : parseFloat(x));
    const r = num(parts[0]); const g = num(parts[1]); const b = num(parts[2]);
    let a = 1;
    if (parts[3] !== undefined) a = String(parts[3]).endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    if ([r, g, b].some((v) => !Number.isFinite(v))) return null;
    return [r, g, b, Number.isFinite(a) ? a : 1];
  }
  return null;
}

function over(fg, bg) {
  const a = fg[3] === undefined ? 1 : fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}

function lum(c) {
  const ch = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

function ratio(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function round(n) { return Math.round(n * 100) / 100; }

/* --------------------------- selector matching --------------------------- */

function parseEl(el) {
  const attrs = el.match(/\[[^\]]+\]/g) || [];
  const withoutAttrs = el.replace(/\[[^\]]+\]/g, '');
  const tagM = /^[a-z0-9]+/i.exec(withoutAttrs);
  return {
    tag: tagM ? tagM[0].toLowerCase() : null,
    classes: (withoutAttrs.match(/\.[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1)),
    ids: (withoutAttrs.match(/#[A-Za-z0-9_-]+/g) || []).map((c) => c.slice(1)),
    attrs
  };
}

function parseCompound(c) {
  const pseudo = c.match(/::?[a-z-]+(\([^)]*\))?/gi) || [];
  const rest = c.replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
  const e = parseEl(rest);
  e.pseudo = pseudo;
  return e;
}

const STATE_PSEUDO = /^:(hover|focus|focus-visible|active|disabled|checked|open|target)$/i;

function compoundMatches(comp, el, allowState) {
  const e = parseEl(el);
  if (comp.tag && comp.tag !== e.tag) return false;
  for (const c of comp.classes) if (!e.classes.includes(c)) return false;
  for (const i of comp.ids) if (!e.ids.includes(i)) return false;
  for (const a of comp.attrs) {
    const want = a.replace(/^\[|\]$/g, '');
    const ok = e.attrs.some((have) => {
      const h = have.replace(/^\[|\]$/g, '');
      return h === want;
    });
    if (!ok) return false;
  }
  for (const p of comp.pseudo) {
    if (STATE_PSEUDO.test(p)) { if (!allowState) return false; continue; }
    if (/^::/.test(p)) continue;
    if (/^:not\(/i.test(p)) {
      const inner = p.slice(5, -1).trim();
      if (compoundMatches(parseCompound(inner), el, allowState)) return false;
      continue;
    }
  }
  return true;
}

function selectorMatches(selector, chain, allowState) {
  if (/\[(hidden|open)\b/.test(selector)) return false;
  if (/^@/.test(selector)) return false;
  const compounds = [];
  const combs = [];
  for (const t of selector.match(/[^\s>+~]+|[>+~]/g) || []) {
    if (t === '>' || t === '+' || t === '~') combs.push(t);
    else compounds.push(parseCompound(t));
  }
  if (!compounds.length || !chain.length) return false;
  let ci = chain.length - 1;
  if (!compoundMatches(compounds[compounds.length - 1], chain[ci], allowState)) return false;
  let pi = compounds.length - 2;
  let k = combs.length - 1;
  while (pi >= 0) {
    const comb = combs[k] || ' ';
    if (comb === '>') {
      ci--;
      if (ci < 0) return false;
      if (!compoundMatches(compounds[pi], chain[ci], allowState)) return false;
    } else {
      let found = false;
      while (ci - 1 >= 0) {
        ci--;
        if (compoundMatches(compounds[pi], chain[ci], allowState)) { found = true; break; }
      }
      if (!found) return false;
    }
    pi--;
    k--;
  }
  return true;
}

function specificity(selector) {
  const clean = selector.replace(/::?[a-z-]+(\([^)]*\))?/gi, ':x');
  const ids = (clean.match(/#[A-Za-z0-9_-]+/g) || []).length;
  const cls = (clean.match(/\.[A-Za-z0-9_-]+/g) || []).length
    + (clean.match(/\[[^\]]+\]/g) || []).length
    + (clean.match(/:x/g) || []).length;
  const tags = clean.replace(/\.[A-Za-z0-9_-]+|#[A-Za-z0-9_-]+|\[[^\]]+\]|:x|\*[a-z0-9_-]*/gi, ' ')
    .split(/[^a-z0-9]+/i).filter((w) => /[a-z0-9]/i.test(w)).length;
  return ids * 100 + cls * 10 + tags;
}

/* --------------------------- effective style --------------------------- */

function effective(elChain, allowState, mediaFilter, theme) {
  const styles = {};
  const winners = {};
  const wantDark = theme === 'dark';
  for (const r of RULES) {
    if (r.atRule || !r.selector) continue;
    if (mediaFilter && !mediaFilter(r.media || '')) continue;
    if (/\[data-theme=['"]?dark/.test(r.selector) && !wantDark) continue;
    if (/\[data-theme=['"]?light/.test(r.selector) && wantDark) continue;
    for (const sel of r.selector.split(',')) {
      const sel2 = sel.trim();
      if (!sel2) continue;
      const sel3 = sel2.replace(/\[data-theme=['"]?(dark|light)['"]?\]\s*/g, '');
      if (!selectorMatches(sel3, elChain, allowState)) continue;
      const spec = specificity(sel3);
      for (const d of declarations(r.body)) {
        const cur = winners[d.prop];
        if (!cur || spec >= cur.spec) {
          winners[d.prop] = { spec, value: d.value, sel: sel2 };
          styles[d.prop] = d.value;
        }
      }
    }
  }
  return { styles, winners };
}

function findColor(styles, props, vars, opaqueOnly) {
  for (const p of props) {
    if (!styles[p]) continue;
    const vals = String(styles[p]).split(/,(?![^()]*\))/);
    for (let i = vals.length - 1; i >= 0; i--) {
      const m = vals[i].match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|\b(white|black|transparent)\b/);
      if (!m) continue;
      const c = parseColor(resolve(m[0], vars));
      if (!c) continue;
      if (opaqueOnly && c[3] < 0.35) continue;
      return { color: c, prop: p };
    }
  }
  return null;
}

const BG_PROPS = ['background', 'background-image', 'background-color'];
const FG_PROPS = ['color'];

/** chain: array of descriptor strings, outermost -> innermost (no html/body). */
function withAncestors(chain) {
  const last = chain[chain.length - 1] || '';
  if (/^(html|body)/.test(last)) return chain;
  return ['html', 'body'].concat(chain);
}

function ancestry(chain) {
  const out = [];
  for (let i = chain.length; i >= 1; i--) out.push(chain.slice(0, i));
  return out;
}

function resolveBg(chain, vars, mediaFilter, theme) {
  for (const probe of ancestry(withAncestors(chain))) {
    const { styles } = effective(probe, false, mediaFilter, theme);
    const hit = findColor(styles, BG_PROPS, vars, true);
    if (hit) return { color: hit.color, from: probe.join(' ').trim() + ' | ' + hit.prop };
  }
  const c = parseColor(resolve('var(--bg)', vars));
  return c ? { color: c, from: 'fallback var(--bg)' } : null;
}

function fgOf(chain, vars, mediaFilter, theme) {
  const { styles } = effective(chain, false, mediaFilter, theme);
  const hit = findColor(styles, FG_PROPS, vars, false);
  return hit ? { color: hit.color, from: hit.prop, raw: styles.color } : null;
}

/* ------------------------------- checks ------------------------------- */

const TEXT_CHAINS = [
  ['body'], ['p'], ['h1'], ['h2'], ['h3'], ['a'], ['span'], ['label'], ['strong'], ['li'], ['button'],
  ['div.filter-bar', 'label'], ['div.filter-bar', 'input'], ['div.filter-bar', 'select'],
  ['div.filter-bar', 'button.btn'], ['div.filter-bar', 'button.btn.ghost'],
  ['div.section', 'div.section-head', 'h2'], ['div.section', 'p.section-note'],
  ['div.section', 'div.grid', 'div.opp-card'], ['div.section', 'div.grid', 'div.company-card'],
  ['div.opp-card', 'div.opp-position'], ['div.opp-card', 'a.opp-company'],
  ['div.opp-card', 'div.card-desc'], ['div.opp-card', 'div.card-addr'],
  ['div.opp-card', 'div.tag-row', 'span.tag'], ['div.opp-card', 'div.opp-actions', 'a.btn'],
  ['div.company-card', 'div.card-desc'], ['div.company-card', 'span.tag'],
  ['div.result-count'], ['div.result-count', 'strong'],
  ['div.empty'], ['div.empty', 'h3'], ['div.empty', 'p'],
  ['div.match-card'], ['div.match-card', 'div.match-badge'], ['div.match-badge', 'span.lbl'],
  ['div.match-card', 'div.why-box', 'div.why-text'], ['div.match-card', 'div.why-box', 'div.why-label'],
  ['div.match-card', 'div.tag-row', 'span.tag'], ['div.match-card', 'div.score'],
  ['div.tier-section', 'div.tier-head', 'div.tier-title'], ['div.tier-section', 'div.tier-count'],
  ['footer.site-footer'], ['footer.site-footer', 'p.footer-note'], ['footer.site-footer', 'a'],
  ['footer.site-footer', 'div.footer-links', 'a'], ['footer.site-footer', 'strong'],
  ['div.modal'], ['div.modal', 'h2'], ['div.modal', 'button.close-x'],
  ['div.modal', 'div.detail-sheet'], ['div.modal', 'div.detail-head', 'h2'],
  ['div.modal', 'div.detail-name'], ['div.modal', 'div.detail-role'],
  ['div.modal', 'div.detail-desc'], ['div.modal', 'div.detail-address'],
  ['div.modal', 'div.detail-progs', 'span.tag'], ['div.modal', 'span.tag'],
  ['div.modal', 'div.detail-label'], ['div.modal', 'div.detail-cta', 'a.btn'],
  ['div.modal', 'div.detail-note'], ['div.modal', 'div.detail-loc'],
  ['div.modal', 'div.logo-badge'], ['div.modal', 'div.detail-openings'],
  ['div.field', 'label'], ['div.field', 'input'], ['div.field', 'select'],
  ['input'], ['select'], ['option'], ['optgroup'], ['select', 'optgroup', 'option'],
  ['div.stat-card'], ['div.stat-card', 'div.num'], ['div.stat-card', 'div.lbl'],
  ['div.feature-card'], ['div.feature-card', 'p'], ['div.feature-card', 'div.icon'],
  ['div.how-it-works'], ['div.how-it-works', 'p'],
  ['header.topbar'], ['header.topbar', 'a.logo'], ['header.topbar', 'nav.topnav', 'a.link'],
  ['header.topbar', 'button.theme-toggle'],
  ['div.hero-cta', 'a.btn'], ['div.hero-program-form', 'label'],
  ['div.hero-program-form', 'select.hero-select'], ['div.hero-program-form', 'div.hint'],
  ['div.about-grid'], ['div.prog-check'], ['div.prog-check-grid'],
  ['div.multi-select-btn'], ['div.multi-select-panel', 'label.ms-option'],
  ['div.multi-select-panel', 'label.ms-option', 'span'],
  ['div.skeleton'], ['div.skeleton', 'div.sk-row'], ['div.toast'],
  ['div.browse-section'], ['div.landing-features'],
  ['ul.check-list', 'li'], ['div.card-narrow'], ['div.match-summary'],
  ['div.detail-card'], ['div.prog-bubbles', 'button.prog-bubble'],
  ['div.why-badges', 'div.why-badge'], ['div.pills', 'button.pill'],
  ['div.pills', 'button.pill.active'], ['button.save-btn'],
  ['a.pill'], ['a.tag'], ['div.tag-row', 'span.tag'], ['span.tag.warn'], ['span.tag.neutral'],
  ['div.stats-row', 'div.stat-card']
];

const ROOTS = ['html[data-theme="light"]', 'html[data-theme="dark"]'];

function auditTheme(themeName, vars, mediaFilter) {
  const issues = [];
  const seen = new Set();
  const root = ROOTS[themeName === 'dark' ? 1 : 0];
  for (const chain of TEXT_CHAINS) {
    const full = [root].concat(chain);
    const fg = fgOf(full, vars, mediaFilter, themeName);
    if (!fg) continue;
    const bg = resolveBg(chain, vars, mediaFilter, themeName);
    if (!bg) continue;
    const eff = over(fg.color, bg.color);
    const r = ratio(eff, bg.color);
    const key = chain.join('') + '@' + round(r);
    if (seen.has(key)) continue;
    seen.add(key);
    if (r < 4.5) {
      issues.push({
        theme: themeName, el: chain.join(' '), ratio: round(r),
        fg: fg.raw, bg: bg.from
      });
    }
  }
  return issues;
}

const allIssues = [
  ...auditTheme('light', LIGHT, (m) => !m || !/max-width/.test(m)),
  ...auditTheme('dark', DARK, (m) => !m || !/max-width/.test(m))
];

const lines = [];
lines.push('CSS rules parsed: ' + RULES.length);
lines.push('light vars: ' + Object.keys(LIGHT).length + '  dark vars: ' + Object.keys(DARK).length);
lines.push('');
lines.push('=== LOW CONTRAST (text vs effective background, < 4.5:1) ===');
if (!allIssues.length) lines.push('none');
for (const i of allIssues) {
  lines.push('[' + i.theme + '] ' + i.el + '  ratio=' + i.ratio + '  color=' + i.fg + '  bg=' + i.bg);
}

/* ---- undefined variables ---- */
const usedVars = new Set();
(CSS.match(/var\(\s*--[A-Za-z0-9_-]+/g) || []).forEach((m) => {
  usedVars.add(m.replace(/var\(\s*/, '').trim());
});
const defined = new Set([...Object.keys(LIGHT), ...Object.keys(DARK)]);
const missing = [...usedVars].filter((v) => !defined.has(v)).sort();
lines.push('');
lines.push('=== UNDEFINED VARIABLES ===');
lines.push(missing.length ? missing.join('\n') : 'none');

/* ---- hardcoded light colours with no dark override ---- */
const HARDCODED_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/;
const hasDarkOverride = (selector) => RULES.some((r) => !r.atRule
  && /\[data-theme=['"]?dark/.test(r.selector)
  && r.selector.split(',').some((s) => s.replace(/\[data-theme=['"]?dark['"]?\]\s*/, '').trim() === selector.trim()));

const hardcoded = [];
for (const r of RULES) {
  if (r.atRule || !r.selector) continue;
  if (/\[data-theme=['"]?dark/.test(r.selector)) continue;
  if (/^(html|:root)$/.test(r.selector.trim())) continue;
  const decls = declarations(r.body).filter((d) => !d.prop.startsWith('--'));
  const colourDecls = decls.filter((d) => /^(color|background|background-color|border|border-color|border-bottom|border-top|border-left|border-right|outline|box-shadow|fill|stroke|background-image)$/.test(d.prop)
    && HARDCODED_RE.test(d.value) && !/var\(/.test(d.value));
  if (!colourDecls.length) continue;
  if (hasDarkOverride(r.selector)) continue;
  hardcoded.push(r.selector + ' { ' + colourDecls.map((d) => d.prop + ': ' + d.value).join('; ') + ' }');
}
lines.push('');
lines.push('=== HARDCODED COLOURS WITHOUT A DARK OVERRIDE (' + hardcoded.length + ') ===');
lines.push(hardcoded.length ? hardcoded.join('\n') : 'none');

/* ---- important / !important and fixed-width heuristics ---- */
const narrow = [];
for (const r of RULES) {
  if (r.atRule || !r.selector) continue;
  for (const d of declarations(r.body)) {
    if (/^(min-width|width)$/.test(d.prop) && /px$/.test(d.value)) {
      const px = parseFloat(d.value);
      if (px >= 300) narrow.push(r.selector + ' { ' + d.prop + ': ' + d.value + ' }');
    }
  }
}
lines.push('');
lines.push('=== WIDE FIXED WIDTHS >= 300px (' + narrow.length + ') ===');
lines.push(narrow.length ? narrow.join('\n') : 'none');

fs.writeFileSync(path.join(ROOT, '_audit.out'), lines.join('\n'), 'utf8');
console.log(lines.join('\n'));