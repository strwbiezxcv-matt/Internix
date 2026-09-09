'use strict';
/* ============================================================
   InternConnect — front-end application (vanilla JS, no deps)
   ============================================================ */

/* ------------------------------ helpers ------------------------------ */

const $ = (sel, root) => (root || document).querySelector(sel);
const app = $('#app');

const state = {
  profile: null,   // temporary session-memory only — no accounts, nothing persisted server-side
  results: null,   // last match results
  catalog: null
};

/* -------- localStorage favorites (browser-local, no login required) -------- */
const FAV_KEY = 'internconnect.favorites';
function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; }
}
function isFavorite(id) { return getFavorites().includes(id); }
function toggleFavorite(id) {
  const favs = getFavorites();
  const i = favs.indexOf(id);
  if (i >= 0) favs.splice(i, 1); else favs.push(id);
  localStorage.setItem(FAV_KEY, JSON.stringify(favs));
  return favs.includes(id);
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* -------- program names: user-facing full names only (acronyms are internal) -------- */
const PROGRAM_NAMES = {
  BSBA: 'Business Administration',
  BSENTREP: 'Entrepreneurship',
  'COMPUTER ENGINEERING': 'Computer Engineering',
  'INDUSTRIAL ENGINEERING': 'Industrial Engineering',
  BINDTECH: 'Bachelor of Industrial Technology',
  BSIT: 'Information Technology'
};
function programName(code) { return PROGRAM_NAMES[code] || code; }
function catalogProgram(cat, code) {
  return (cat && cat.programs) ? cat.programs.find((p) => p.code === code) : null;
}
function fieldsForProgram(cat, code) {
  const prog = catalogProgram(cat, code);
  return prog ? (prog.fields || []) : [];
}
function fieldsForSpecialization(cat, code, specName) {
  const prog = catalogProgram(cat, code);
  if (!prog) return [];
  const spec = prog.specializations.find((s) => s.name === specName);
  return spec ? (spec.fields || []) : [];
}
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  if (!res.ok || !json || json.ok === false) {
    const msg = (json && json.error) || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function toast(msg, isErr) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toastHolder').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openModal(html) {
  $('#modalContent').innerHTML = html;
  $('#modalBackdrop').hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modalBackdrop').hidden = true;
  $('#modalContent').innerHTML = '';
  document.body.style.overflow = '';
}
$('#modalClose').addEventListener('click', closeModal);
$('#modalBackdrop').addEventListener('click', (e) => { if (e.target === $('#modalBackdrop')) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d + (String(d).length === 10 ? 'T00:00:00' : ''));
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function statusPill(status) {
  return `<span class="status-pill status-${esc(status)}">${esc(status || 'saved')}</span>`;
}

function matchBadge(m) {
  if (!m) return '';
  const cls = m.score >= 85 ? '' : m.score >= 65 ? 'mid' : 'low';
  return `<div class="match-badge ${cls}" title="Profile Compatibility — based on your profile and the opportunity requirements">
    <div class="pct">${m.score}%</div><div class="lbl">match</div></div>`;
}

function matchPanel(m) {
  if (!m) return '';
  const checks = (m.checks || []).map((c) => {
    const mark = c.ok === true ? '✓' : c.ok === false ? '✕' : '△';
    return `<li class="${c.ok === true ? 'ok' : c.ok === false ? 'no' : 'part'}">${mark} ${esc(c.label)}</li>`;
  }).join('');
  const b = m.breakdown || {};
  const pct = (v) => Math.round((v || 0) * 100);
  return `<div class="match-panel">
    <h3>Profile Compatibility: ${m.score}%</h3>
    <p class="match-reason">${esc(m.reason || '')}</p>
    <ul class="check-list">${checks}</ul>
    <div class="match-breakdown opp-meta" style="margin-top:10px">
      Skills ${pct(b.skills)}% (30%) • Course ${pct(b.course)}% (25%) • Specialization ${pct(b.specialization)}% (15%)
      • Interest ${pct(b.field)}% (15%) • Location ${pct(b.location)}% (10%) • Work setup ${pct(b.arrangement)}% (5%)
    </div>
    ${m.note ? `<p class="match-reason" style="margin-top:8px">${esc(m.note)}</p>` : ''}
  </div>`;
}

function verificationBadge(o) {
  if (o.verification_status && o.verification_status === 'verified') {
    return `<span class="tag verified" title="Verified from an official source: ${esc(o.source_name || o.source_url || '')}">✔ Verified</span>`;
  }
  return ''; // no demo/sample labelling — unverified listings simply carry no badge
}

function slotsText(o) {
  return (o.slots && o.slots > 0) ? String(o.slots) : 'Not specified';
}
function deadlineText(o) {
  return o.application_deadline ? fmtDate(o.application_deadline) : 'Deadline not specified';
}
function applicationLinkHTML(o) {
  if (o.application_url) {
    return `<a href="${esc(o.application_url)}" target="_blank" rel="noopener noreferrer">Visit official page</a>`;
  }
  if (o.application_method) return esc(o.application_method);
  if (o.company_website) {
    return `Application link unavailable — visit the official company website: <a href="${esc(o.company_website)}" target="_blank" rel="noopener noreferrer">${esc(o.company_website)}</a>`;
  }
  return '<em>Application link unavailable — visit the company\'s official careers page.</em>';
}

function logoHTML(opp) {
  const initials = (opp.company_name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return opp.company_logo
    ? `<div class="logo"><img src="${esc(opp.company_logo)}" alt=""></div>`
    : `<div class="logo">${esc(initials)}</div>`;
}

function chipsEditor(id, values, placeholder) {
  return `<div class="chips-input" id="${id}" data-values='${esc(JSON.stringify(values || []))}'>
    <input type="text" placeholder="${esc(placeholder || 'Type and press Enter…')}">
  </div>`;
}
function readChips(id) {
  return JSON.parse($(`#${id}`).dataset.values || '[]');
}
function bindChips(id) {
  const box = $(`#${id}`);
  const input = box.querySelector('input');
  function render() {
    box.querySelectorAll('.chip').forEach((c) => c.remove());
    JSON.parse(box.dataset.values).forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${esc(v)} <button type="button" data-i="${i}" aria-label="Remove">&times;</button>`;
      box.insertBefore(chip, input);
    });
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = input.value.trim().replace(/,+$/, '');
      if (!v) return;
      const vals = JSON.parse(box.dataset.values);
      if (!vals.some((x) => x.toLowerCase() === v.toLowerCase())) {
        vals.push(v);
        box.dataset.values = JSON.stringify(vals);
        render();
      }
      input.value = '';
    } else if (e.key === 'Backspace' && !input.value) {
      const vals = JSON.parse(box.dataset.values);
      if (vals.length) { vals.pop(); box.dataset.values = JSON.stringify(vals); render(); }
    }
  });
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-i]');
    if (!btn) return;
    const vals = JSON.parse(box.dataset.values);
    vals.splice(+btn.dataset.i, 1);
    box.dataset.values = JSON.stringify(vals);
    render();
  });
}
/* ------------------------------ navigation ------------------------------ */

function go(hash) { location.hash = hash; }

function renderNav() {
  const nav = $('#mainNav');
  const links = [['#/', 'Home'], ['#/match', 'Find Matches'], ['#/browse', 'Browse'], ['#/companies', 'Companies'], ['#/saved', 'Saved']];
  nav.innerHTML = links.map(([h, label]) => `<a href="${h}">${label}</a>`).join('');
  const cur = location.hash || '#/';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === cur));
  $('#topbar').hidden = false;
}

$('#navToggle').addEventListener('click', () => {
  const nav = $('#mainNav');
  nav.classList.toggle('open');
  $('#navToggle').setAttribute('aria-expanded', nav.classList.contains('open'));
});
$('#mainNav').addEventListener('click', () => $('#mainNav').classList.remove('open'));

/* ------------------------------ shared opportunity components ------------------------------ */

function oppCardHTML(r, opts) {
  const o = r.opportunity;
  const progs = (o.programs || []);
  return `<div class="card opp-card" data-opp="${o.id}">
    <div class="opp-card-top">
      ${logoHTML(o)}
      <div style="flex:1;min-width:0">
        <div class="opp-position">${esc(o.position)}</div>
        <div class="opp-company">${esc(o.company_name)}</div>
        <div class="opp-meta">📍 ${esc(o.location || 'Location not specified')} &nbsp;•&nbsp; ${esc(o.work_arrangement || 'Arrangement not specified')}</div>
      </div>
      ${matchBadge(r.match)}
    </div>
    <div class="tag-row">
      <span class="tag">Internship / OJT</span>
      ${progs.slice(0, 3).map((p) => `<span class="tag">${esc(programName(p))}</span>`).join('')}
      ${verificationBadge(o)}
    </div>
    ${(o.skills && o.skills.length) ? `<div class="tag-row"><span class="k">Skills:</span> ${o.skills.slice(0, 5).map((s) => `<span class="tag skill">${esc(s)}</span>`).join('')}</div>` : ''}
    <div class="opp-meta">Duration: <strong>${esc(o.duration || 'Not specified')}</strong> &nbsp;•&nbsp; Deadline: <strong>${deadlineText(o)}</strong>${o.is_expired ? ' &nbsp;•&nbsp; <strong class="expired-text">Expired</strong>' : ''}</div>
    <div class="opp-actions">
      <button class="btn btn-primary btn-sm" data-act="view" data-id="${o.id}">View Details</button>
      ${o.application_url ? `<a class="btn btn-outline btn-sm" href="${esc(o.application_url)}" target="_blank" rel="noopener noreferrer">Apply on Company Site</a>` : ''}
      <button class="icon-btn ${isFavorite(o.id) ? 'saved' : ''}" data-act="fav" data-id="${o.id}"
        title="${isFavorite(o.id) ? 'Saved in this browser' : 'Save to favorites'}">${isFavorite(o.id) ? '♥' : '♡'}</button>
    </div>
  </div>`;
}
async function openDetail(id) {
  try {
    const d = await api('GET', '/api/opportunities/' + id);
    const o = d.opportunity;
    openModal(`
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:8px">
        ${logoHTML(o)}
        <div style="flex:1">
          <h2>${esc(o.position)}</h2>
          <div class="opp-company">${esc(o.company_name)}</div>
        </div>
        ${matchBadge(d.match)}
      </div>
      ${d.match ? matchPanel(d.match) : ''}
      ${o.verification_status && o.verification_status === 'verified'
        ? `<p class="opp-meta" style="margin:6px 0 0">Source: ${esc(o.source_name || 'Official source')} ${o.source_url ? `— <a href="${esc(o.source_url)}" target="_blank" rel="noopener noreferrer">official page</a>` : ''}${o.verified_at ? ` (verified ${fmtDate(o.verified_at)})` : ''}</p>`
        : ''}
      <p style="margin:10px 0 14px">${esc(o.description)}</p>
      <div class="tag-row" style="margin-bottom:14px">
        ${(o.programs || []).map((p) => `<span class="tag">${esc(programName(p))}</span>`).join('')}
        ${(o.skills || []).map((s) => `<span class="tag skill">${esc(s)}</span>`).join('')}
      </div>
      <div class="meta-list">
        <div class="row"><span class="k">Internship field</span><span class="v">${esc(o.field || 'Not specified')}</span></div>
        <div class="row"><span class="k">Location</span><span class="v">${esc(o.location || 'Not specified')}</span></div>
        <div class="row"><span class="k">Work arrangement</span><span class="v">${esc(o.work_arrangement || 'Not specified')}</span></div>
        <div class="row"><span class="k">Open slots</span><span class="v">${slotsText(o)}</span></div>
        <div class="row"><span class="k">Duration</span><span class="v">${esc(o.duration || 'Not specified')}</span></div>
        <div class="row"><span class="k">Required hours</span><span class="v">${o.required_hours || 'Not specified'}</span></div>
        <div class="row"><span class="k">Compensation</span><span class="v">Not specified</span></div>
        <div class="row"><span class="k">Application deadline</span><span class="v">${deadlineText(o)}${o.is_expired ? ' — <strong class="expired-text">Expired</strong>' : ''}</span></div>
        <div class="row"><span class="k">How to apply</span><span class="v">${applicationLinkHTML(o)}</span></div>
        <div class="row"><span class="k">Date posted</span><span class="v">${fmtDate(o.date_posted)}</span></div>
      </div>
      ${o.company_website ? `<p class="opp-meta" style="margin:6px 0 0">Company website: <a href="${esc(o.company_website)}" target="_blank" rel="noopener noreferrer">${esc(o.company_website)}</a></p>` : ''}
      <div style="display:flex;gap:10px;margin-top:18px;flex-wrap:wrap">
        <button class="btn btn-outline" data-mact="fav">${isFavorite(id) ? '♥ Saved' : '♡ Save'}</button>
      </div>
    `);
    $('#modalContent').querySelectorAll('[data-mact]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const now = toggleFavorite(id);
        btn.textContent = now ? '♥ Saved' : '♡ Save';
        toast(now ? 'Saved in this browser.' : 'Removed from saved.');
        route();
      });
    });
  } catch (err) { toast(err.message, true); }
}
/* ------------------------------ landing page ------------------------------ */

function landingView() {
  const programs = state.catalog ? state.catalog.programs : [];
  app.innerHTML = `
    <section class="hero">
      <h1>Find the Right Internship for You.</h1>
      <p>Tell us about your program, skills, interests, and preferences, and Internix will
         match you with internships &amp; OJT opportunities that fit your profile — using
         transparent Smart Internship Matching. No account required, no guesswork.</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="#/match">Find My Internship</a>
        <a class="btn btn-outline" href="#/browse">Browse Internships</a>
        <a class="btn btn-ghost" href="#/companies">Explore Companies</a>
      </div>
    </section>
    <section class="feature-row">
      <div class="card feature-card">
        <div class="icon">🎯</div>
        <h3>Smart Internship Matching</h3>
        <p>Your profile is compared with every opportunity — course, specialization,
           skills, interests, location, and work setup — and scored transparently.</p>
      </div>
      <div class="card feature-card">
        <div class="icon">🔍</div>
        <h3>Search &amp; Filter</h3>
        <p>Filter opportunities by program, field, skills, location, work arrangement,
           and duration so you only see what's relevant.</p>
      </div>
      <div class="card feature-card">
        <div class="icon">🏢</div>
        <h3>Real Companies &amp; Sources</h3>
        <p>Discover real, independently verified companies and legitimate opportunity
           sources. No account, no application — just clear information and official links.</p>
      </div>
    </section>
    <section class="programs-strip">
      <h2>Built for every program</h2>
      <div class="pills">
        ${programs.map((p) => `<span class="tag">${esc(p.name)}</span>`).join('')}
      </div>
      <p style="margin-top:12px;font-size:0.88rem">From Business Administration and Industrial Technology to
         Engineering and Information Technology — Internix supports students across all programs
         and specializations.</p>
    </section>`;
}
/* ------------------------------ step 1: student information (no account) ------------------------------ */

const LOCATION_OPTIONS = [
  'Bulacan', 'Malolos', 'Meycauayan', 'San Jose del Monte', 'Marilao', 'Bocaue',
  'Balagtas', 'Guiguinto', 'Plaridel', 'Baliwag', 'Pulilan', 'Calumpit', 'Santa Maria',
  'San Ildefonso', 'Obando', 'Bulakan', 'Norzagaray',
  'Metro Manila', 'Manila', 'Quezon City', 'Makati', 'Taguig', 'Pasig', 'Mandaluyong',
  'Pasay', 'Parañaque', 'Muntinlupa', 'Caloocan', 'Marikina', 'Las Piñas', 'Valenzuela',
  'Navotas', 'Malabon', 'San Juan', 'Pateros'
];
const DURATION_OPTIONS = ['240 hours', '300 hours', '486 hours', '640 hours', '1 month', '2 months', '3 months', '4 months', '5 months', '6 months'];
const INDUSTRY_OPTIONS = ['Technology / IT', 'IT Services & Consulting', 'Food & Agribusiness', 'Food Manufacturing', 'FMCG / Consumer Goods', 'Financial Services / Capital Markets', 'Marketing', 'Manufacturing', 'Retail', 'Logistics', 'Architecture', 'Automotive', 'Human Resources'];

function matchFormView() {
  const cat = state.catalog;
  if (!cat) { app.innerHTML = '<div class="empty skeleton">Loading…</div>'; return; }
  const p = state.profile || {};
  const opts = (arr, sel) => arr.map((x) =>
    `<option value="${esc(x)}" ${sel === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
  const programOptions = cat.programs.map((pr) =>
    `<option value="${esc(pr.code)}" ${p.program === pr.code ? 'selected' : ''}>${esc(pr.name)}</option>`).join('');
  const specOptions = (code) => {
    const prog = cat.programs.find((x) => x.code === code);
    return (prog ? prog.specializations : [])
      .map((s) => `<option value="${esc(s.name)}" ${p.specialization === s.name ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  };
  const fieldOptionsFor = (code, specName) => {
    let fs = fieldsForProgram(cat, code);
    const sf = fieldsForSpecialization(cat, code, specName);
    if (sf.length) fs = fs.concat(sf.filter((f) => !fs.includes(f)));
    if (!fs.length) return '';
    return fs.map((f) => `<option value="${esc(f)}" ${p.preferred_field === f ? 'selected' : ''}>${esc(f)}</option>`).join('');
  };
  app.innerHTML = `
    <div class="page-head"><h1>Tell us about yourself</h1>
      <p>This takes under a minute. No account needed — your information stays in this
         browser session and is only used to calculate your compatibility matches.</p></div>
    <div class="card" style="max-width:760px">
      <form id="matchForm">
        <div class="field"><label>Name <span class="hint">(optional)</span></label>
          <input type="text" id="mName" value="${esc(p.full_name || '')}" placeholder="e.g. Juan Dela Cruz"></div>
        <div class="form-row">
          <div class="field"><label>Program / Course</label>
            <select id="mProgram" required><option value="">Select program…</option>${programOptions}</select></div>
          <div class="field"><label>Specialization</label>
            <select id="mSpec"><option value="">—</option>${specOptions(p.program)}</select></div>
        </div>
        <div class="field"><label>Skills</label>
          ${chipsEditor('mSkills', p.skills || [], 'e.g. Python — press Enter to add')}
          <span class="hint">Press Enter or comma to add each skill. Click × to remove.</span></div>
        <div class="form-row">
          <div class="field"><label>Internship / OJT field of interest</label>
            <select id="mField"><option value="">—</option>${fieldOptionsFor(p.program, p.specialization)}</select>
            <span class="hint">Fields are filtered to those relevant to your selected program.</span></div>
          <div class="field"><label>Preferred industry <span class="hint">(optional)</span></label>
            <select id="mIndustry"><option value="">—</option>${opts(INDUSTRY_OPTIONS, p.preferred_industry)}</select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Preferred location</label>
            <select id="mLocation"><option value="">—</option>${opts(LOCATION_OPTIONS, p.preferred_location)}</select></div>
          <div class="field"><label>Work arrangement</label>
            <select id="mArrangement"><option value="">—</option>
              ${opts(['On-site', 'Hybrid', 'Remote'], p.work_arrangement)}</select></div>
        </div>
        <div class="field"><label>Internship duration</label>
          <select id="mDuration"><option value="">—</option>${opts(DURATION_OPTIONS, p.internship_duration)}</select></div>
        <button class="btn btn-primary btn-block" type="submit">Find My Matches</button>
        <p class="hint" style="margin-top:10px">Your matches are computed with transparent
           Smart Internship Matching — a weighted compatibility algorithm, not an AI prediction.</p>
      </form>
    </div>`;

  bindChips('mSkills');

  $('#mProgram').addEventListener('change', () => {
    const code = $('#mProgram').value;
    $('#mSpec').innerHTML = '<option value="">—</option>' + specOptions(code);
    $('#mField').innerHTML = '<option value="">—</option>' + fieldOptionsFor(code, $('#mSpec').value);
  });
  $('#mSpec').addEventListener('change', () => {
    $('#mField').innerHTML = '<option value="">—</option>' + fieldOptionsFor($('#mProgram').value, $('#mSpec').value);
  });

  $('#matchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const profile = {
      full_name: $('#mName').value.trim(),
      program: $('#mProgram').value,
      specialization: $('#mSpec').value || null,
      skills: readChips('mSkills'),
      preferred_field: $('#mField').value || null,
      preferred_industry: $('#mIndustry').value || null,
      preferred_location: $('#mLocation').value || null,
      work_arrangement: $('#mArrangement').value || null,
      internship_duration: $('#mDuration').value || null
    };
    if (!profile.program) { toast('Please choose your program.', true); return; }
    if (!profile.skills.length) { toast('Add at least one skill so matching is meaningful.', true); return; }
    app.innerHTML = '<div class="empty skeleton">Calculating your compatibility matches…</div>';
    try {
      const d = await api('POST', '/api/match', profile);
      state.profile = d.profile;
      state.results = d;
      go('#/matches');
      route();
    } catch (err) { toast(err.message, true); matchFormView(); }
  });
}
/* ------------------------------ step 2: your internship matches ------------------------------ */

function normalize(s) {
  return String(s || '').trim().toLowerCase();
}

function matchesView() {
  if (!state.results) { go('#/match'); return; }
  const { profile, results } = state.results;
  const cat = state.catalog;
  const first = profile.full_name ? profile.full_name.split(' ')[0] : '';
  const summary = [
    programName(profile.program) || null,
    profile.specialization || null,
    profile.preferred_field || null,
    profile.preferred_location ? '📍 ' + profile.preferred_location : null,
    profile.work_arrangement || null,
    profile.internship_duration || null,
    profile.preferred_industry || null
  ].filter(Boolean).map((s) => `<span class="tag">${esc(s)}</span>`).join('');
  const skillTags = (profile.skills || []).map((s) => `<span class="tag skill">${esc(s)}</span>`).join('');

  const industryOptions = [...new Set(results.map((r) => r.opportunity.company_industry).filter(Boolean))].sort();
  const progFields = fieldsForProgram(cat, profile.program);
  const fieldOptions = progFields.length ? progFields : (cat ? cat.fields.map((f) => f.name) : []);

  app.innerHTML = `
    <div class="page-head" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-end">
      <div><h1>Your Internship Matches${first ? ', ' + esc(first) : ''}</h1>
        <p>Ranked by profile compatibility — based on your inputs and each opportunity's actual
           requirements. This is <strong>not</strong> a prediction of acceptance or hiring.</p></div>
      <a class="btn btn-ghost btn-sm" href="#/match">✎ Edit details</a>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="tag-row">${summary || '<span class="tag">No preferences given</span>'}</div>
      ${skillTags ? `<div class="tag-row" style="margin-top:8px">${skillTags}</div>` : ''}
    </div>
    <form class="filter-bar" id="matchFilter">
      <div class="field q-field"><label>Search</label>
        <input type="text" id="mfQ" placeholder="Position, company, keyword…"></div>
      <div class="field"><label>Field</label>
        <select id="mfField"><option value="">Any</option>
          ${fieldOptions.map((f) => `<option>${esc(f)}</option>`).join('')}</select></div>
      <div class="field"><label>Arrangement</label>
        <select id="mfArrangement"><option value="">Any</option>
          <option>On-site</option><option>Hybrid</option><option>Remote</option></select></div>
      <div class="field"><label>Industry</label>
        <select id="mfIndustry"><option value="">Any</option>
          ${industryOptions.map((i) => `<option>${esc(i)}</option>`).join('')}</select></div>
    </form>
    <div class="section"><div id="matchResults" class="grid grid-2"></div></div>`;

  const renderList = () => {
    const q = ($('#mfQ').value || '').trim().toLowerCase();
    const f = $('#mfField').value;
    const a = $('#mfArrangement').value;
    const ind = $('#mfIndustry').value;
    const filtered = results.filter((r) => {
      const o = r.opportunity;
      if (q && !(normalize(o.position).includes(q) || normalize(o.company_name).includes(q) ||
                 normalize(o.description).includes(q))) return false;
      if (f && normalize(o.field) !== normalize(f)) return false;
      if (a && normalize(o.work_arrangement) !== normalize(a)) return false;
      if (ind && normalize(o.company_industry) !== normalize(ind)) return false;
      return true;
    });
    const holder = $('#matchResults');
    if (!filtered.length) {
      holder.innerHTML = '<div class="empty"><span class="big">🔍</span>No matching opportunities for these filters. Adjust the filters or <a href="#/match">update your details</a>.</div>';
      return;
    }
    holder.innerHTML = filtered.map((r) => oppCardHTML(r)).join('');
    bindCards(holder);
  };
  $('#matchFilter').addEventListener('submit', (e) => { e.preventDefault(); renderList(); });
  ['#mfQ', '#mfField', '#mfArrangement', '#mfIndustry', '#mfVerification'].forEach((sel) => {
    $(sel).addEventListener('input', renderList);
    $(sel).addEventListener('change', renderList);
  });
  renderList();
}

/* Bind favorite buttons + card clicks for cards made with oppCardHTML */
function bindCards(root) {
  root.querySelectorAll('.opp-card').forEach((card) => {
    const id = +card.dataset.opp;
    const favBtn = card.querySelector('[data-act="fav"]');
    if (favBtn) {
      favBtn.classList.toggle('saved', isFavorite(id));
      favBtn.textContent = isFavorite(id) ? '♥' : '♡';
    }
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-act]')) return;
      openDetail(id);
    });
  });
  root.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +btn.dataset.id;
      if (btn.dataset.act === 'view') return openDetail(id);
      if (btn.dataset.act === 'fav') {
        const now = toggleFavorite(id);
        btn.classList.toggle('saved', now);
        btn.textContent = now ? '♥' : '♡';
        toast(now ? 'Saved in this browser.' : 'Removed from saved.');
      }
    });
  });
}
/* ------------------------------ browse + filters ------------------------------ */

async function browseView() {
  const cat = state.catalog;
  if (!cat) { app.innerHTML = '<div class="empty skeleton">Loading…</div>'; return; }
  app.innerHTML = `
    <div class="page-head"><h1>Browse Opportunities</h1>
      <p>Search and filter internships, OJT &amp; entry-level openings.</p></div>
    <form class="filter-bar" id="filterForm">
      <div class="field q-field"><label>Search</label>
        <input type="text" id="fQ" placeholder="Position, company, keyword…"></div>
      <div class="field"><label>Program</label>
        <select id="fProgram"><option value="">Any</option>
          ${cat.programs.map((p) => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Field</label>
        <select id="fField"><option value="">Any</option>
          ${cat.fields.map((f) => `<option value="${esc(f.name)}">${esc(f.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Location</label>
        <input type="text" id="fLocation" placeholder="e.g. Bulacan"></div>
      <div class="field"><label>Arrangement</label>
        <select id="fArrangement"><option value="">Any</option>
          <option>On-site</option><option>Hybrid</option><option>Remote</option></select></div>
      <div class="field"><label>Industry</label>
        <input type="text" id="fIndustry" placeholder="e.g. Technology"></div>
      <div class="field"><label>Duration</label>
        <select id="fDuration"><option value="">Any</option>${DURATION_OPTIONS.map((d) => `<option>${esc(d)}</option>`).join('')}</select></div>
      <div class="field" style="flex-direction:row;align-items:end">
        <button class="btn btn-primary btn-sm" type="submit">Search</button>
        <button class="btn btn-ghost btn-sm" type="button" id="fClear">Clear</button></div>
    </form>
    <div class="section"><div id="browseResults" class="grid grid-2"></div></div>`;

  const run = async () => {
    const params = new URLSearchParams();
    const q = $('#fQ').value.trim(); if (q) params.set('q', q);
    const p = $('#fProgram').value; if (p) params.set('program', p);
    const f = $('#fField').value; if (f) params.set('field', f);
    const loc = $('#fLocation').value.trim(); if (loc) params.set('location', loc);
    const arr = $('#fArrangement').value; if (arr) params.set('work_arrangement', arr);
    const ind = $('#fIndustry').value.trim(); if (ind) params.set('industry', ind);
    const dur = $('#fDuration').value; if (dur) params.set('duration', dur);
    const holder = $('#browseResults');
    holder.innerHTML = '<div class="empty">Searching…</div>';
    try {
      const rows = await api('GET', '/api/opportunities' + (params.toString() ? '?' + params : ''));
      if (!rows.length) {
        holder.innerHTML = '<div class="empty"><span class="big">🔍</span>No verified internship opportunities found for your current filters. Try adjusting or clearing them.</div>';
        return;
      }
      holder.innerHTML = rows.map((r) => oppCardHTML(r)).join('');
      bindCards(holder);
    } catch (err) { holder.innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
  };
  $('#filterForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#fClear').addEventListener('click', () => { $('#filterForm').reset(); run(); });
  run();
}

/* ------------------------------ saved opportunities (localStorage, no account) ------------------------------ */

async function savedView() {
  const ids = getFavorites();
  if (!ids.length) {
    app.innerHTML = `
      <div class="page-head"><h1>Saved Opportunities</h1>
        <p>Favorites are stored in this browser only — no account needed.</p></div>
      <div class="empty"><span class="big">♡</span>No saved opportunities yet.
        <a href="#/browse">Browse</a> or <a href="#/match">find your matches</a> and tap the heart to save one.</div>`;
    return;
  }
  app.innerHTML = '<div class="empty skeleton">Loading…</div>';
  const rows = (await Promise.all(ids.map((id) => api('GET', '/api/opportunities/' + id).catch(() => null))))
    .filter(Boolean)
    .map((d) => ({ opportunity: d.opportunity }));
  app.innerHTML = `
    <div class="page-head"><h1>Saved Opportunities</h1>
      <p>Favorites are stored in this browser only — no account needed.</p></div>
    ${rows.length ? `<div class="grid grid-2">${rows.map((r) => oppCardHTML(r)).join('')}</div>`
      : '<div class="empty"><span class="big">♡</span>Saved opportunities are no longer available.</div>'}`;
  bindCards(app);
}

/* ------------------------------ companies directory ------------------------------ */

async function openCompanyDetail(id) {
  try {
    const d = await api('GET', '/api/companies/' + id);
    const c = d.company;
    const opps = d.opportunities || [];
    const progs = (d.relevant_programs || []).map(programName);
    const fields = (d.relevant_fields || []);
    const skills = (d.relevant_skills || []);
    const initials = (c.company_name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    openModal(`
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:8px">
        <div class="logo">${esc(initials)}</div>
        <div style="flex:1"><h2>${esc(c.company_name)}</h2>
          <div class="opp-meta">📍 ${esc(c.location || 'Not specified')} &nbsp;•&nbsp; ${esc(c.industry || 'Not specified')}</div></div>
      </div>
      <p style="margin:8px 0 12px">${esc(c.description || '')}</p>
      <div class="meta-list">
        <div class="row"><span class="k">Industry</span><span class="v">${esc(c.industry || 'Not publicly available')}</span></div>
        <div class="row"><span class="k">Location</span><span class="v">${esc(c.location || 'Not publicly available')}</span></div>
        <div class="row"><span class="k">Company size</span><span class="v">${esc(c.company_size || 'Not publicly available')}</span></div>
        <div class="row"><span class="k">Year established</span><span class="v">${c.year_established ? esc(String(c.year_established)) : 'Not publicly available'}</span></div>
        ${c.website ? `<div class="row"><span class="k">Website</span><span class="v"><a href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a></span></div>` : ''}
        ${c.careers_url ? `<div class="row"><span class="k">Careers page</span><span class="v"><a href="${esc(c.careers_url)}" target="_blank" rel="noopener noreferrer">${esc(c.careers_url)}</a></span></div>` : ''}
        ${progs.length ? `<div class="row"><span class="k">Relevant programs</span><span class="v">${esc(progs.join(', '))}</span></div>` : ''}
        ${fields.length ? `<div class="row"><span class="k">Relevant fields</span><span class="v">${esc(fields.join(', '))}</span></div>` : ''}
        ${skills.length ? `<div class="row"><span class="k">Relevant skills</span><span class="v">${esc(skills.join(', '))}</span></div>` : ''}
      </div>
      <div style="margin-top:14px"><strong>Internship opportunities</strong></div>
      ${opps.length
        ? `<div class="section" style="margin-top:8px">${opps.map((o) => oppCardHTML({ opportunity: o })).join('')}</div>`
        : '<p class="opp-meta" style="margin-top:8px">No current internship opportunity listed.</p>'}
    `);
    if (opps.length) bindCards($('#modalContent'));
  } catch (err) { toast(err.message, true); }
}

async function companiesView() {
  app.innerHTML = '<div class="empty skeleton">Loading companies…</div>';
  let companies;
  try { companies = await api('GET', '/api/companies'); }
  catch (err) { app.innerHTML = `<div class="empty">${esc(err.message)}</div>`; return; }

  const card = (c) => {
    const initials = (c.company_name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const loc = c.location || (c.city ? c.city + ', ' + c.province : 'Not specified');
    return `
    <div class="card opp-card">
      <div class="opp-card-top">
        <div class="logo">${esc(initials)}</div>
        <div style="flex:1;min-width:0">
          <div class="opp-position">${esc(c.company_name)}</div>
          <div class="opp-meta">📍 ${esc(loc)} &nbsp;•&nbsp; ${esc(c.industry || 'Not specified')}</div>
        </div>
      </div>
      <p class="opp-meta" style="margin:8px 0">${esc(c.description || '')}</p>
      <div class="tag-row" style="margin-bottom:10px">
        <span class="tag verified" title="Real company, verifiable via public records / official source">✔ Verified Company</span>
        ${c.has_verified_opening ? '<span class="tag">Has verified opening</span>' : '<span class="tag">No current internship opportunity listed</span>'}
      </div>
      <div class="opp-actions">
        <button class="btn btn-primary btn-sm" data-cact="view" data-cid="${c.id}">View Company</button>
        ${c.website ? `<a class="btn btn-outline btn-sm" href="${esc(c.website)}" target="_blank" rel="noopener noreferrer">Official Website</a>` : ''}
      </div>
    </div>`;
  };

  app.innerHTML = `
    <div class="page-head"><h1>Companies</h1>
      <p>Real, independently verifiable organizations in Bulacan &amp; Metro Manila. A company appearing
      here does not necessarily have a current internship opening — openings are verified separately
      from official sources.</p></div>
    <div class="section">
      <div class="section-head"><h2>Company Directory</h2></div>
      ${companies.length ? `<div class="grid grid-2">${companies.map(card).join('')}</div>`
        : '<div class="empty">No companies found.</div>'}
    </div>`;

  app.querySelectorAll('[data-cact="view"]').forEach((b) => b.addEventListener('click', () => openCompanyDetail(+b.dataset.cid)));
}

/* ------------------------------ router ------------------------------ */

const routes = {
  '#/': landingView,
  '#/match': matchFormView,
  '#/matches': matchesView,
  '#/browse': browseView,
  '#/companies': companiesView,
  '#/saved': savedView
};

async function route() {
  const hash = location.hash || '#/';
  renderNav();
  const view = routes[hash] || landingView;
  await view();
}

/* ------------------------------ boot ------------------------------ */

async function boot() {
  try {
    state.catalog = await api('GET', '/api/catalog');
  } catch { state.catalog = { programs: [], skills: [], fields: [] }; }
  window.addEventListener('hashchange', route);
  route();
}

boot();
