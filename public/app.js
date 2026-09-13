'use strict';
/* ============================================================
   Internix - Student Internship Discovery + Company Directory
   Program-first matching platform. No accounts, no application
   tracking - a pure discovery and matching experience.
   ============================================================ */

/* ------------------------------ helpers ------------------------------ */
const $ = (sel, root) => (root || document).querySelector(sel);
const app = $('#app');

const state = {
  catalog: null,
  profile: null,      // { program, program_name, specialization, location, work_arrangement }
  results: null,      // match results
  companies: [],
  opps: []
};

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
    const msg = (json && json.error) || 'Request failed (' + res.status + ')';
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json.data;
}

function fmtDate(d) {
  if (!d) return 'Not specified';
  const dt = new Date((String(d).length === 10 ? d + 'T00:00:00' : d));
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function initials(name) {
  return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function logoHTML(name, logoUrl) {
  if (logoUrl) return '<div class="logo"><img src="' + esc(logoUrl) + '" alt=""></div>';
  return '<div class="logo">' + esc(initials(name)) + '</div>';
}

function programNames(list) {
  return (state.catalog ? state.catalog.programs : []).filter((p) => list.includes(p.code)).map((p) => p.name);
}
/* ------------------------------ saved companies (localStorage) ------------------------------ */
const SAVED_CO_KEY = 'internix.savedCompanies';
function getSavedCompanyIds() {
  try { return JSON.parse(localStorage.getItem(SAVED_CO_KEY)) || []; } catch { return []; }
}
function setSavedCompanyIds(ids) {
  try { localStorage.setItem(SAVED_CO_KEY, JSON.stringify(ids)); } catch {}
}
function isSavedCompany(id) { return getSavedCompanyIds().includes(+id); }
function toggleSavedCompany(id) {
  id = +id;
  let ids = getSavedCompanyIds();
  if (ids.includes(id)) ids = ids.filter((x) => x !== id);
  else ids.push(id);
  setSavedCompanyIds(ids);
  return ids.includes(id);
}
/* ------------------------------ toast & modal ------------------------------ */
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

/* ------------------------------ navigation ------------------------------ */
function go(hash) { location.hash = hash; }

function renderNav() {
  const nav = $('#mainNav');
  const links = [
    ['#/', 'Home'],
    ['#/opportunities', 'Internship Opportunities'],
    ['#/companies', 'Companies'],
    ['#/find-matches', 'Find My Matches'],
    ['#/saved', 'Saved'],
    ['#/about', 'About']
  ];
  const currentHash = location.hash || '#/';
  nav.innerHTML = links.map(([h, label]) =>
    '<a href="' + h + '" class="link' + (currentHash === h || (h === '#/find-matches' && (currentHash === '#/match' || currentHash === '#/matches')) ? ' active' : '') + '">' + label + '</a>').join('');
  $('#topbar').hidden = false;
}
$('#navToggle').addEventListener('click', () => {
  const nav = $('#mainNav');
  nav.classList.toggle('open');
  $('#navToggle').setAttribute('aria-expanded', nav.classList.contains('open'));
});
$('#mainNav').addEventListener('click', () => $('#mainNav').classList.remove('open'));

/* ---------------------- selected program (localStorage) ---------------------- */
const ARRANGEMENTS = ['On-site', 'Hybrid', 'Remote'];
function saveProfile(p) { localStorage.setItem('internix.profile', JSON.stringify(p || {})); state.profile = p; }
function loadProfile() {
  try { return JSON.parse(localStorage.getItem('internix.profile')) || null; } catch { return null; }
}
const PROG_KEY = 'internix.selectedProgram';
function getStoredProgram() { try { return localStorage.getItem(PROG_KEY); } catch { return null; } }
function setStoredProgram(code) { try { if (code) localStorage.setItem(PROG_KEY, code); else localStorage.removeItem(PROG_KEY); } catch {} }
function selectedProgram() { return state.profile && state.profile.program ? state.profile.program : (getStoredProgram() || null); }
function selectedPrograms() {
  if (state.profile && Array.isArray(state.profile.programs) && state.profile.programs.length) return state.profile.programs.slice();
  const single = selectedProgram();
  return single ? [single] : [];
}
function programLabel(code) {
  const o = (state.catalog && state.catalog.program_options || []).find((x) => x.value === code);
  if (o) return o.label;
  return code;
}
function programLabels(codes) { return (codes || []).map(programLabel); }
function selectedLocation() { return (state.profile && state.profile.location) || ''; }
/* Location helpers: strict Bulacan vs Metro Manila separation. */
function locationLabel(v) { return v || ''; }
function opportunityLocation(o) {
  if (o._loc && o._loc.label) return o._loc.label;
  return o.location || ((o.city ? o.city + ', ' : '') + (o.province || '')) || 'Location not specified';
}
/* ------------------------------ shared cards ------------------------------ */
/* Centralized client-side match helper: ONE implementation used by
   Find My Matches results, Internship Opportunities, Companies, and
   Featured lists so every section ranks identically. */
function clientMatch(o, selectedProgramsArg, selectedLocationArg) {
  const sel = (selectedProgramsArg || []).filter(Boolean);
  const oppCodes = (o.programs || []).map(String);
  const oppNames = (o.program_names || o.relevant_programs || []).map((s) => String(s || '').toLowerCase());
  let programTier = 'mismatch';
  if (!sel.length) programTier = 'none';
  else {
    const opts = (state.catalog && state.catalog.program_options) || [];
    const normSel = sel.map(String);
    const exact = normSel.some((c) => oppCodes.includes(c));
    if (exact) programTier = 'exact';
    else {
      const selNames = opts.filter((x) => normSel.includes(x.value)).map((x) => String(x.label).toLowerCase());
      const relatedHit = selNames.some((n) => oppNames.some((p) => p === n || p.includes(n) || n.includes(p)));
      programTier = relatedHit ? 'related' : (oppCodes.length === 0 ? 'open' : 'mismatch');
    }
  }
  let locationOk = true;
  if (selectedLocationArg) {
    const want = String(selectedLocationArg).toLowerCase();
    const hay = String((o.location || '') + ' ' + (o.province || '') + ' ' + (o.city || '') + ' ' + ((o._loc && o._loc.label) || '')).toLowerCase();
    if (want === 'bulacan') locationOk = hay.includes('bulacan') && !hay.includes('metro manila');
    else if (want === 'metro manila') locationOk = hay.includes('metro manila') || hay.includes(', metro') || hay.includes('manila') || hay.includes('makati') || hay.includes('quezon city') || hay.includes('pasig') || hay.includes('taguig');
    else locationOk = hay.includes(want);
  }
  return { programTier: programTier, locationOk: locationOk };
}
function sameLocationFilter(o, loc) {
  if (!loc) return true;
  return clientMatch(o, [], loc).locationOk;
}
/* Centralized dropdown option builder (single source of truth). */
function programOptionsHtml(selected, placeholder) {
  const opts = (state.catalog && state.catalog.program_options) || [];
  return '<option value="">' + esc(placeholder || 'Select your program...') + '</option>' +
    opts.map((o) => '<option value="' + esc(o.value) + '"' + (o.value === selected ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('');
}
function locationOptionsHtml(selected, placeholder) {
  const locs = (state.catalog && state.catalog.locations) || ['Bulacan', 'Metro Manila'];
  return '<option value="">' + esc(placeholder || 'Select location...') + '</option>' +
    locs.map((l) => '<option value="' + esc(l) + '"' + (l === selected ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
}
function arrangementOptionsHtml(selected) {
  return '<option value="">Any arrangement</option>' +
    ARRANGEMENTS.map((a) => '<option value="' + esc(a) + '"' + (a === selected ? ' selected' : '') + '>' + esc(a) + '</option>').join('');
}
/* ---------------------- View Details (one consistent modal) ---------------------- */
function isHttp(u) {
  return typeof u === 'string' && (u.indexOf('http://') === 0 || u.indexOf('https://') === 0);
}
function isWeb(u) {
  return isHttp(u) || (typeof u === 'string' && u.indexOf('mailto:') === 0);
}
function detailLogo(name, url) {
  if (isHttp(url)) return '<div class="detail-logo"><img src="' + esc(url) + '" alt="" loading="lazy"></div>';
  return '<div class="detail-logo">' + esc(initials(name)) + '</div>';
}
/* Pick ONE best official external link for an internship opportunity. */
function pickOppLink(o) {
  const cand = [
    [o.application_url, 'View Official Application'],
    [o.source_url, 'View Official Application'],
    [o.company_careers_url, 'View Official Application'],
    [o.company_official_website, 'Visit Official Company'],
    [o.company_website, 'Visit Official Company']
  ];
  for (const [u, label] of cand) if (isHttp(u)) return { url: u, label };
  return null;
}
/* Pick ONE best official external link for a company. */
function pickCompanyLink(c) {
  const cand = [
    [c.careers_url, 'View Official Application'],
    [c.official_website, 'Visit Official Company'],
    [c.website, 'Visit Official Company'],
    [c.source_url, 'Visit Official Company']
  ];
  for (const [u, label] of cand) if (isHttp(u)) return { url: u, label };
  if (c.contact_info) {
    const m = c.contact_info.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/i);
    if (m && m[0]) return { url: 'mailto:' + m[0], label: 'Contact Company' };
  }
  return null;
}
/* Single, clean detail modal template used everywhere. */
function detailSheet(o) {
  const progs = (o.programs || []);
  const progTags = progs.map((p) => '<span class="tag">' + esc(p) + '</span>').join('');
  const addressHtml = o.address
    ? '<div class="detail-address"><span class="d-ico">&#128205;</span><span>' + esc(o.address) + '</span></div>'
    : '';
  const cta = (o.href && isWeb(o.href))
    ? '<a class="btn btn-primary detail-cta" href="' + esc(o.href) + '" target="_blank" rel="noopener noreferrer">' + esc(o.label || 'View Official Application') + ' &#8599;</a>'
    : '<p class="detail-note">No official application link is available for this listing.</p>';
  return '<div class="detail-sheet">' +
    '<div class="detail-head">' + detailLogo(o.name, o.logo) + '<h3 class="detail-name">' + esc(o.name) + '</h3></div>' +
    (o.title ? '<div class="detail-role">' + esc(o.title) + '</div>' : '') +
    (o.desc ? '<p class="detail-desc">' + esc(o.desc) + '</p>' : '') +
    addressHtml +
    (progs.length ? '<div class="detail-progs"><span class="detail-label">Matched Programs</span><div class="tag-row">' + progTags + '</div></div>' : '') +
    cta +
  '</div>';
}
function oppCard(o, showScore) {
  const score = (showScore && showScore.score) ? '<div class="match-badge"><div class="pct">' + showScore.score + '%</div><div class="lbl">match</div></div>' : '';
  const progs = (o.programs || []);
  const progLabels = progs.slice(0, 3).map((p) => {
    const label = programNames([p])[0] || p;
    return '<span class="tag">' + esc(label) + '</span>';
  }).join('');
  const sourceBtn = o.source_url
    ? '<a class="btn btn-outline btn-sm" href="' + esc(o.source_url) + '" target="_blank" rel="noopener noreferrer">View Official Source</a>'
    : '';
  return '<div class="card opp-card" data-opp="' + o.id + '">' +
    '<div class="opp-card-top">' + logoHTML(o.company_name, o.company_logo) +
      '<div style="flex:1;min-width:0"><div class="opp-position">' + esc(o.position) + '</div>' +
      '<div class="opp-company">' + esc(o.company_name) + '</div>' +
      '<div class="opp-meta">' + esc(o.location || 'Location not specified') +
        (o.work_arrangement ? ' &bull; ' + esc(o.work_arrangement) : '') + '</div></div>' + score +
    '</div>' +
    '<div class="tag-row">' + progLabels +
      (o.programs.length > 3 ? '<span class="tag neutral">+' + (o.programs.length - 3) + ' more</span>' : '') +
    '</div>' +
    '<p class="opp-meta">' + esc((o.description || '').slice(0, 140)) + (o.description && o.description.length > 140 ? '&hellip;' : '') + '</p>' +
    '<div class="opp-actions"><button class="btn btn-primary btn-sm" data-act="view" data-id="' + o.id + '">View Details</button>' +
    sourceBtn + '</div></div>';
}

function bindCards(root) {
  root.querySelectorAll('[data-act="view"]').forEach((b) =>
    b.addEventListener('click', () => openDetail(+b.dataset.id)));
}

async function openDetail(id) {
  try {
    const d = await api('GET', '/api/opportunities/' + id);
    const o = d.opportunity;
    const progs = (o.program_names && o.program_names.length)
      ? o.program_names
      : (o.programs || []).map((p) => programNames([p])[0] || p);
    const address = o.company_address
      || (o._loc && o._loc.label ? o._loc.label : (o.location || ''));
    const link = pickOppLink(o);
    openModal(detailSheet({
      name: o.company_name,
      logo: o.company_logo,
      title: o.position,
      desc: o.description,
      address: address,
      programs: progs,
      href: link ? link.url : null,
      label: link ? link.label : null
    }));
  } catch (err) { toast(err.message, true); }
}
function companyCard(c, index) {
  const loc = c.location || (c.city ? c.city + ', ' + c.province : (c.province || 'Location not specified'));
  const availability = c.has_verified_opening
    ? '<span class="tag">Internship available</span>'
    : '<span class="tag neutral">Company directory entry</span>';
  const progs = (c.relevant_programs || []);
  const progTags = progs.slice(0, 3).map((p) => '<span class="tag">' + esc(p) + '</span>').join('');
  const suffix = (index !== undefined && (index > 7)) ? ' style="order:2"' : '';
  const saved = isSavedCompany(c.id);
  return '<div class="card company-card" data-cid="' + c.id + '"' + suffix + '>' +
    '<div class="opp-card-top">' + logoHTML(c.company_name, c.logo_url) +
      '<div style="flex:1;min-width:0"><div class="opp-position">' + esc(c.company_name) + '</div>' +
      '<div class="opp-meta">' + esc(c.industry || '') + ' &bull; ' + esc(loc) + '</div></div></div>' +
    '<p class="opp-meta" style="margin:8px 0">' + esc(c.description || '') + '</p>' +
    '<div class="tag-row" style="margin-bottom:10px">' + availability + progTags + '</div>' +
    '<div class="opp-actions"><button class="btn btn-primary btn-sm" data-cact="view" data-cid="' + c.id + '">View Company</button>' +
      (c.website ? '<a class="btn btn-outline btn-sm" href="' + esc(c.website) + '" target="_blank" rel="noopener noreferrer">Website</a>' : '') +
      '<button class="btn btn-ghost btn-sm save-btn" data-cact="save" data-cid="' + c.id + '">' + (saved ? '★' : '☆') + '</button>' +
    '</div></div>';
}

async function openCompanyDetail(id) {
  try {
    const d = await api('GET', '/api/companies/' + id);
    const c = d.company;
    const opps = d.opportunities || [];
    const progs = (d.relevant_program_names && d.relevant_program_names.length)
      ? d.relevant_program_names
      : (c.relevant_programs || []);
    const address = c.address
      || c.location
      || (c.city ? c.city + ', ' + c.province : (c.province || ''));
    const link = pickCompanyLink(c);
    const title = opps.length === 1 ? opps[0].position
      : (opps.length > 1 ? 'Internship / OJT opportunities available' : '');
    const oppRows = opps.length
      ? '<div class="detail-openings"><span class="detail-label">Current Openings</span><div class="small-opp-list">' +
        opps.map((o) => '<div class="small-opp" data-opp="' + o.id + '">' +
          '<span class="opp-position">' + esc(o.position) + '</span>' +
          '<span class="d-chevy">&#8250;</span></div>').join('') +
        '</div></div>'
      : '';
    openModal(detailSheet({
      name: c.company_name,
      logo: c.logo_url,
      title: title,
      desc: (c.description || '').slice(0, 320),
      address: address,
      programs: progs,
      href: link ? link.url : null,
      label: link ? link.label : null
    }) + oppRows);
    $('#modalContent').querySelectorAll('.small-opp').forEach((el) =>
      el.addEventListener('click', () => openDetail(+el.dataset.opp)));
  } catch (err) { toast(err.message, true); }
}
/* ============================== LANDING PAGE ============================== */
function landingView() {
  const options = state.catalog ? (state.catalog.program_options || []) : [];
  const sel = selectedProgram();
  const progBubbles = options.slice(0, 10).map((o) =>
    '<button type="button" class="prog-bubble" data-prog="' + esc(o.value) + '">' + esc(o.label) + '</button>').join('');
  const featured = state.opps.slice(0, 3).map((o) => oppCard(o)).join('');
  const popCos = state.companies.slice(0, 6);
  const popCards = popCos.map((c, i) => companyCard(c, i)).join('');
  const locs = (state.catalog && state.catalog.locations) || ['Bulacan', 'Metro Manila'];
  const savedLoc = selectedLocation();

  app.innerHTML =
    '<section class="hero">' +
      '<h1>Find Internship Opportunities That Match Your Program</h1>' +
      '<p class="hero-sub">Explore internship opportunities and companies across Bulacan and Metro Manila based on your academic program. Browse freely, discover companies, and visit official sources to apply - no account needed.</p>' +
      '<form class="hero-program-form" id="heroProgForm">' +
        '<label for="heroProgram">Which program are you taking?</label>' +
        '<div class="hero-select-row"><select id="heroProgram" class="hero-select">' + programOptionsHtml(sel, 'Select your program...') + '</select>' +
        '<button class="btn btn-primary btn-lg" type="submit">Find My Matches</button></div>' +
        '<div class="hero-select-row" style="margin-top:10px"><select id="heroLocation" class="hero-select" aria-label="Preferred location">' + locationOptionsHtml(savedLoc, 'Anywhere (Bulacan + Metro Manila)') + '</select></div>' +
      '</form>' +
      '<div class="hero-cta">' +
        '<a class="btn btn-outline btn-lg" href="#/opportunities">Browse All Opportunities</a>' +
        '<a class="btn btn-ghost btn-lg" href="#/companies">Explore Companies</a>' +
      '</div>' +
    '</section>' +
    (featured ? '<section class="section"><div class="section-head"><h2>Featured Internship Opportunities</h2><a class="link" href="#/opportunities">View all &rarr;</a></div><div class="grid grid-3" id="featuredGrid">' + featured + '</div></section>' : '') +
    (popCards ? '<section class="section"><div class="section-head"><h2>Popular Companies</h2><a class="link" href="#/companies">Explore all &rarr;</a></div><div class="grid grid-3" id="companyGrid">' + popCards + '</div></section>' : '') +
    '<section class="section" style="margin-top:34px"><div class="section-head"><h2>Browse by Program</h2></div><div class="pills" id="browseByProgram">' + progBubbles + '</div></section>' +
    '<section class="feature-row"><div class="card feature-card"><div class="icon">' + '\u{1F50D}' + '</div><h3>Discover</h3><p>Browse internships and a growing company directory across Bulacan and Metro Manila.</p></div>' +
      '<div class="card feature-card"><div class="icon">' + '\u{1F50C}' + '</div><h3>Match by program</h3><p>Select your academic program and see relevant internships ranked by compatibility.</p></div>' +
      '<div class="card feature-card"><div class="icon">' + '\u{1F4C1}' + '</div><h3>Apply on the source</h3><p>Every listing links to the official company page. Application happens externally.</p></div>' +
    '</section>' +
    '<section class="how-it-works"><h2>How Internix Works</h2><ol><li>Select your academic program (or browse freely).</li><li>Internix ranks internships and companies relevant to your program.</li><li>Review company details and eligibility, then open the official source to apply.</li></ol></section>';

  const runMatch = () => {
    const code = $('#heroProgram').value;
    if (!code) { toast('Please select your program.', true); return; }
    const loc = $('#heroLocation') ? $('#heroLocation').value : '';
    const profile = { programs: [code], program: code, specialization: null, location: loc || null, work_arrangement: null };
    saveProfile(profile);
    setStoredProgram(code);
    go('#/find-matches');
    route();
  };
  $('#heroProgForm').addEventListener('submit', (e) => { e.preventDefault(); runMatch(); });
  const heroLoc = $('#heroLocation');
  if (heroLoc) heroLoc.addEventListener('change', (e) => {
    const cur = state.profile || {};
    saveProfile({ programs: cur.programs, program: cur.program, specialization: cur.specialization || null, location: e.target.value || null, work_arrangement: cur.work_arrangement || null });
  });
  $('#progBubbles').querySelectorAll('button[data-prog]').forEach((b) =>
    b.addEventListener('click', () => { setStoredProgram(b.dataset.prog); go('#/find-matches'); route(); }));
  $('#featuredGrid') && $('#featuredGrid').querySelectorAll('button[data-act]').forEach((b) =>
    b.addEventListener('click', () => openDetail(+b.dataset.id)));
  $('#companyGrid') && $('#companyGrid').querySelectorAll('[data-cact="view"]').forEach((b) =>
    b.addEventListener('click', () => openCompanyDetail(+b.dataset.cid)));
}
/* ============================== FIND MY MATCHES (program-first) ============================== */
function matchView() {
  const cat = state.catalog;
  if (!cat) { app.innerHTML = '<div class="empty skeleton">Loading...</div>'; return; }
  const p = state.profile || {};
  const options = cat.program_options || [];
  const stored = p.programs || (p.program ? [p.program] : null) || (getStoredProgram() ? [getStoredProgram()] : []);
  const locSel = p.location || '';
  const locOpts = (cat.locations || []).map((l) =>
    '<option value="' + esc(l) + '" ' + (l === locSel ? 'selected' : '') + '>' + esc(l) + '</option>').join('');
  const arrOpts = ARRANGEMENTS.map((a) =>
    '<option value="' + esc(a) + '" ' + (a === p.work_arrangement ? 'selected' : '') + '>' + esc(a) + '</option>').join('');
  const checks = options.map((o) =>
    '<label class="prog-check' + (stored.includes(o.value) ? ' on' : '') + '"><input type="checkbox" name="matchProg" value="' + esc(o.value) + '"' + (stored.includes(o.value) ? ' checked' : '') + '><span class="check-box" aria-hidden="true"></span><span>' + esc(o.label) + '</span></label>').join('');

  app.innerHTML =
    '<div class="page-head"><h1>Find My Matches</h1><p class="page-sub">Select your program(s) and location. Internix ranks opportunities by program compatibility (50%), location (25%), role relevance (15%) and skills fit (10%) — never random.</p></div>' +
    '<div class="card card-narrow">' +
    '<form id="matchForm">' +
      '<div class="field"><span class="field-label" id="progLabel">Programs <span class="hint">(select one or more)</span></span>' +
        '<div class="prog-check-grid" role="group" aria-labelledby="progLabel">' + checks + '</div></div>' +
      '<div class="form-row" style="margin-top:14px">' +
        '<div class="field"><label for="locSelect">Location</label>' +
          '<select id="locSelect"><option value="">Anywhere (Bulacan + Metro Manila)</option>' + locOpts + '</select></div>' +
        '<div class="field"><label for="arrSelect">Work arrangement <span class="hint">(optional)</span></label>' +
          '<select id="arrSelect"><option value="">Any</option>' + arrOpts + '</select></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap"><button class="btn btn-primary btn-block btn-lg" type="submit" style="flex:1;min-width:220px">Find My Matches</button>' +
      '<button class="btn btn-ghost btn-lg" type="button" id="matchClear">Clear</button></div>' +
      '<p class="hint" style="margin-top:8px">Program fit counts most. Bulacan and Metro Manila are matched separately — selecting one never returns the other. Match % reflects real criteria, not random values.</p>' +
    '</form></div>';

  $('#matchForm').querySelectorAll('.prog-check input').forEach((cb) =>
    cb.addEventListener('change', () => cb.closest('.prog-check').classList.toggle('on', cb.checked)));
  $('#matchClear').addEventListener('click', () => {
    $('#matchForm').querySelectorAll('.prog-check input').forEach((cb) => { cb.checked = false; cb.closest('.prog-check').classList.remove('on'); });
    $('#locSelect').value = ''; $('#arrSelect').value = '';
  });
  $('#matchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codes = Array.from($('#matchForm').querySelectorAll('.prog-check input:checked')).map((cb) => cb.value);
    if (!codes.length) { toast('Please select at least one program.', true); return; }
    const profile = {
      programs: codes,
      program: codes[0],
      specialization: null,
      location: $('#locSelect').value || null,
      work_arrangement: $('#arrSelect').value || null
    };
    saveProfile(profile);
    setStoredProgram(codes[0]);
    try { localStorage.setItem('internix.selectedPrograms', JSON.stringify(codes)); } catch {}
    app.innerHTML = '<div class="empty skeleton">Finding your internship matches...</div>';
    try {
      const d = await api('POST', '/api/match', profile);
      state.results = d;
      state.profile = d.profile;
      saveProfile(d.profile);
      go('#/matches');
      route();
    } catch (err) { toast(err.message, true); matchView(); }
  });
}
function matchesView() {
  if (!state.results) { go('#/find-matches'); route(); return; }
  const { profile, results } = state.results;
  const progNames = profile.program_names || (profile.program_name ? [profile.program_name] : (profile.program ? [profile.program] : []));
  const locName = profile.location || (profile.location_resolved && (profile.location_resolved.municipality || profile.location_resolved.province)) || '';
  const card = (r) => {
    const o = r.opportunity;
    const checks = (r.match.checks || []).map((c) =>
      '<li class="' + (c.ok === true ? 'ok' : c.ok === false ? 'no' : 'part') + '">' +
      (c.ok === true ? '✓' : c.ok === false ? '✗' : '△') + ' ' + esc(c.label) + '</li>').join('');
    const where = o.location ? '<div class="opp-meta">' + esc(o.location) + '</div>' : '';
    const progs = (o.program_names || []).slice(0, 2).map((p) => '<span class="tag">' + esc(p) + '</span>').join('');
    const source = o.source_url ? '<a class="btn btn-outline btn-sm" href="' + esc(o.source_url) + '" target="_blank" rel="noopener noreferrer">View Official Source</a>' : '';
    return '<div class="match-card">' +
      '<div class="match-card-top"><div class="match-badge big"><div class="pct">' + r.match.score + '%</div><div class="lbl">match</div></div>' +
        '<div style="flex:1;min-width:0"><div class="opp-position">' + esc(o.position) + '</div>' +
        '<div class="opp-company">' + esc(o.company_name) + '</div>' + where + '</div>' +
        '<button class="btn btn-primary btn-sm" data-act="view" data-id="' + o.id + '">View Details</button>' +
      '</div>' +
      '<div class="why-box"><div class="why-label">Why this matches:</div><ul class="check-list">' + checks + '</ul></div>' +
      '<div class="tag-row">' + progs + '<span class="tag neutral">' + esc((o.work_arrangement || 'Arrangement not specified')) + '</span></div>' +
      '<div class="opp-actions">' + source + '</div></div>';
  };
  app.innerHTML =
    '<div class="page-head"><h1>Your Internship Matches</h1>' +
      '<p>Based on your selected program' + (progNames.length > 1 ? 's' : '') + ': <strong>' + esc(progNames.join(' + ')) + '</strong>' +
      (locName ? ' in <strong>' + esc(locName) + '</strong>' : '') + '.' +
      ' Scores are program-to-opportunity compatibility for ranking - they do not predict acceptance or hiring.</p></div>' +
    '<div class="match-summary" id="matchSummary"></div>' +
    '<div class="section"><div class="result-count" id="matchCount"></div><div id="matchResults" class="match-list"></div></div>';
  const filters = { q: '', loc: '', arr: '' };
  const applyFilters = () => {
    const q = filters.q.trim().toLowerCase();
    return (results || []).filter((r) => {
      const o = r.opportunity;
      if (q && !((o.position || '') + ' ' + (o.company_name || '') + ' ' + (o.description || '')).toLowerCase().includes(q)) return false;
      if (filters.loc && !((o.location || '') + ' ' + ((o._loc && o._loc.label) || '')).toLowerCase().includes(filters.loc.toLowerCase())) return false;
      if (filters.arr && (o.work_arrangement || '') !== filters.arr) return false;
      return true;
    });
  };
  const paint = () => {
    const holder = $('#matchResults');
    const count = $('#matchCount');
    const filtered = applyFilters();
    // Dedupe: one card per opportunity id.
    const seen = new Set();
    const unique = filtered.filter((r) => {
      const id = r.opportunity && r.opportunity.id;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    if (count) count.innerHTML = 'Showing <strong>' + unique.length + '</strong> of <strong>' + results.length + '</strong> matched opportunit' + (results.length === 1 ? 'y' : 'ies');
    if (!unique.length) { holder.innerHTML = '<div class="empty">No matches found. Adjust your program or <a href="#/find-matches">update your details</a>.</div>'; return; }
    holder.innerHTML = unique.map(card).join('');
    holder.querySelectorAll('[data-act="view"]').forEach((b) => b.addEventListener('click', () => openDetail(+b.dataset.id)));
  };
  const render = () => {
    $('#matchSummary').innerHTML = '<form class="filter-bar" id="matchFilter" style="grid-template-columns:2fr 1fr 1fr auto">' +
      '<div class="field q-field"><label>Search</label><input type="text" id="matchQ" placeholder="Position, company, keyword..." value="' + esc(filters.q) + '"></div>' +
      '<div class="field"><label>Location</label><select id="matchLoc"><option value="">Any</option>' + (state.catalog.locations || []).map((l) => '<option' + (filters.loc === l ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Arrangement</label><select id="matchArr"><option value="">Any</option>' + ARRANGEMENTS.map((a) => '<option' + (filters.arr === a ? ' selected' : '') + '>' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div class="field field-actions"><button class="btn btn-ghost btn-sm" type="button" id="matchClearBtn">Clear</button></div>' +
      '</form>';
    $('#matchQ').addEventListener('input', (e) => { filters.q = e.target.value; paint(); });
    $('#matchLoc').addEventListener('change', (e) => { filters.loc = e.target.value; paint(); });
    $('#matchArr').addEventListener('change', (e) => { filters.arr = e.target.value; paint(); });
    $('#matchClearBtn').addEventListener('click', () => { filters.q = ''; filters.loc = ''; filters.arr = ''; render(); paint(); });
    paint();
  };
  $('#matchSummary').innerHTML = '<div class="empty skeleton">Loading...</div>';
  render();
}
/* ============================== BROWSE OPPORTUNITIES ============================== */
async function browseView() {
  const cat = state.catalog;
  if (!cat) { app.innerHTML = '<div class="empty skeleton">Loading...</div>'; return; }
  const opt = (o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>';
  const sel = selectedProgram();
  const companyOpts = state.companies.map((c) => '<option value="' + esc(c.company_name) + '">' + esc(c.company_name) + '</option>').join('');
  app.innerHTML =
    '<div class="page-head"><h1>Internship Opportunities</h1></div>' +
    '<form class="filter-bar" id="filterForm">' +
      '<div class="field q-field"><label>Search</label><input type="text" id="fQ" placeholder="Position, company, keyword, skill, location..."></div>' +
      '<div class="field"><label>Program</label><select id="fProgram"><option value="">All programs</option>' + (cat.program_options || []).map(opt).join('') + '</select></div>' +
      '<div class="field"><label>Location</label><select id="fLocation"><option value="">All locations</option>' + (cat.locations || []).map((l) => '<option>' + esc(l) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Work arrangement</label><select id="fArrangement"><option value="">Any</option>' + ARRANGEMENTS.map((a) => '<option>' + esc(a) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Company</label><select id="fCompany"><option value="">All companies</option>' + companyOpts + '</select></div>' +
      '<div class="field field-actions"><button class="btn btn-primary btn-sm" type="submit">Search</button><button class="btn btn-ghost btn-sm" type="button" id="fClear">Clear</button></div>' +
    '</form>' +
    '<div class="section"><div id="browseResults" class="grid grid-2"></div></div>';
  const run = async (resetSel) => {
    const params = new URLSearchParams();
    const q = $('#fQ').value.trim(); if (q) params.set('q', q);
    const p = $('#fProgram').value; if (p) params.set('program', p);
    const loc = $('#fLocation').value; if (loc) params.set('location', loc);
    const arr = $('#fArrangement').value; if (arr) params.set('work_arrangement', arr);
    const co = $('#fCompany').value; if (co) params.set('company', co);
    const holder = $('#browseResults');
    holder.innerHTML = '<div class="empty skeleton">Searching...</div>';
    try {
      const rows = await api('GET', '/api/opportunities' + (params.toString() ? '?' + params : ''));
      state.opps = rows;
      if (!rows.length) { holder.innerHTML = '<div class="empty">No opportunities found for these filters. Try adjusting them.</div>'; return; }
      const shown = sel && !p ? rows.filter((o) => (o.programs || []).includes(sel)) : rows;
      const list = shown.length ? shown : rows;
      holder.innerHTML = '<div class="section-note" id="browseNote"></div>' + list.map((o) => oppCard(o)).join('');
      if (shown.length && sel && !p) $('#browseNote').innerHTML = '<span>Showing <strong>' + shown.length + '</strong> opportunities relevant to your selected program. <a href="#/opportunities">Clear program</a> to see all.</span>';
      else if ($('#browseNote')) $('#browseNote').remove();
      bindCards(holder);
    } catch (err) { holder.innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; }
  };
  if (sel) $('#fProgram').value = '';
  $('#filterForm').addEventListener('submit', (e) => { e.preventDefault(); run(); });
  $('#fClear').addEventListener('click', () => { $('#filterForm').reset(); $('#fProgram').value = sel || ''; run(); });
  run();
}
/* ============================== COMPANIES DIRECTORY ============================== */
async function companiesView() {
  const filter = { q: '', province: '', program: '' };
  const cat = state.catalog;
  try {
    let params = '';
    const rows = await api('GET', '/api/companies' + params);
    state.companies = rows;
    const card = (c, i) => companyCard(c, i);
    const render = () => {
      const q = filter.q.trim().toLowerCase();
      const progObj = filter.program ? (cat ? (cat.program_options || []).find((o) => o.value === filter.program) : null) : null;
      const progLabel = progObj ? String(progObj.label).toLowerCase() : '';
      const list = state.companies.filter((c) => {
        if (q && !(c.company_name + ' ' + (c.industry || '') + ' ' + (c.description || '') + ' ' + (c.city || '') + ' ' + (c.relevant_programs || []).join(' ')).toLowerCase().includes(q)) return false;
        if (filter.province && ((c.province || '') || (c.region || '')) !== filter.province) return false;
        if (filter.program) {
          const names = (c.relevant_programs || []).map((s) => String(s).toLowerCase());
          const codes = (c.relevant_program_codes || []).map(String);
          const byName = progLabel && names.some((n) => n === progLabel || n.includes(progLabel) || progLabel.includes(n));
          const byCode = codes.includes(filter.program);
          if (!byName && !byCode) return false;
        }
        return true;
      });
      const holder = $('#companyGrid');
      if (!list.length) { holder.innerHTML = '<div class="empty">No companies found for these filters.</div>'; return; }
      holder.innerHTML = list.map(card).join('');
      holder.querySelectorAll('[data-cact="view"]').forEach((b) => b.addEventListener('click', () => openCompanyDetail(+b.dataset.cid)));
      holder.querySelectorAll('[data-cact="save"]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const on = toggleSavedCompany(+b.dataset.cid);
          b.classList.toggle('on', on);
          b.textContent = on ? '★' : '☆';
          toast(on ? 'Company saved.' : 'Removed from saved.');
        }));
    };
    const progOpts = (cat ? cat.program_options : []).map((o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('');
    app.innerHTML =
      '<div class="page-head"><h1>Companies</h1><p>Explore real organizations across Bulacan and Metro Manila. A company here may or may not have a current internship opening - availability is shown per company.</p></div>' +
      '<form class="filter-bar" id="companyFilter">' +
        '<div class="field q-field"><label>Search</label><input type="text" id="cQ" placeholder="Company name, industry, keyword..."></div>' +
        '<div class="field"><label>Location</label><select id="cProvince"><option value="">All locations</option><option>Bulacan</option><option>Metro Manila</option></select></div>' +
        '<div class="field"><label>Program</label><select id="cProgram"><option value="">All programs</option>' + progOpts + '</select></div>' +
        '<div class="field field-actions"><button class="btn btn-primary btn-sm" type="submit">Search</button><button class="btn btn-ghost btn-sm" type="button" id="cClear">Clear</button></div>' +
      '</form>' +
      '<div class="section"><div class="section-head"><h2>Company Directory</h2><span class="pill" id="cCount">' + state.companies.length + ' companies</span></div><div class="grid grid-3" id="companyGrid"></div></div>';
    $('#companyFilter').addEventListener('submit', (e) => { e.preventDefault(); filter.q = $('#cQ').value; filter.province = $('#cProvince').value; filter.program = $('#cProgram').value; render(); });
    $('#cClear').addEventListener('click', () => { $('#companyFilter').reset(); filter.q = ''; filter.province = ''; filter.program = ''; render(); });
    render();
  } catch (err) { app.innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; }
}
/* ============================== SAVED COMPANIES ============================== */
function savedView() {
  const ids = getSavedCompanyIds();
  if (!ids.length) {
    app.innerHTML = '<div class="empty"><div class="empty-icon">&#9733;</div><p>No companies saved yet.</p><p class="hint">Save companies from the Companies page to view them here later.</p></div>';
    return;
  }
  app.innerHTML = '<div class="page-head"><h1>Saved Companies</h1><p class="hint">' + ids.length + ' company' + (ids.length > 1 ? 'ies' : 'y') + ' saved</p></div>';
  const holder = document.createElement('div');
  holder.className = 'grid grid-3';
  holder.id = 'savedGrid';
  app.appendChild(holder);

  const render = async () => {
    try {
      const companies = await api('GET', '/api/companies');
      const saved = companies.filter((c) => ids.includes(c.id));
      if (!saved.length) {
        holder.innerHTML = '<div class="empty">Your saved companies are no longer available.</div>';
        return;
      }
      holder.innerHTML = saved.map((c, i) => companyCard(c, i)).join('');
      holder.querySelectorAll('[data-cact="view"]').forEach((b) =>
        b.addEventListener('click', () => openCompanyDetail(+b.dataset.cid)));
      holder.querySelectorAll('[data-cact="save"]').forEach((b) =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          const on = toggleSavedCompany(+b.dataset.cid);
          b.classList.toggle('on', on);
          b.textContent = on ? '★' : '☆';
          toast(on ? 'Company saved.' : 'Removed from saved.');
          savedView();
        }));
    } catch (err) { holder.innerHTML = '<div class="empty">' + esc(err.message) + '</div>'; }
  };
  render();
}

/* ============================== ABOUT ============================== */
function aboutView() {
  const nCompanies = state.companies.length;
  const nOpps = state.opps.length;
  const optCount = state.catalog ? (state.catalog.program_options || []).length : 0;
  app.innerHTML =
    '<div class="page-head"><h1>About Internix</h1></div>' +
    '<div class="about-grid">' +
      '<div class="card feature-card"><div class="icon">' + '\u{1F3E0}' + '</div><h3>What is Internix?</h3><p>Internix is an internship discovery and matching platform for students. It connects your academic program to real companies and internship opportunities across Bulacan and Metro Manila.</p></div>' +
      '<div class="card feature-card"><div class="icon">' + '\u{1F4CA}' + '</div><h3>How matching works</h3><p>Select your program and Internix ranks opportunities by program-to-opportunity compatibility using the opportunity\'s preferred programs, related programs, and internship field. No paid AI - a transparent, database-driven score.</p></div>' +
      '<div class="card feature-card"><div class="icon">' + '\u{1F517}' + '</div><h3>Where to apply</h3><p>Internix does not process applications. Every listing links to the company official source or careers page where you apply externally.</p></div>' +
    '</div>' +
    '<div class="stats-row"><div class="stat-card"><div class="num">' + nCompanies + '</div><div class="lbl">Companies</div></div>' +
      '<div class="stat-card"><div class="num">' + nOpps + '</div><div class="lbl">Opportunities</div></div>' +
      '<div class="stat-card"><div class="num">' + optCount + '</div><div class="lbl">Programs</div></div>' +
    '</div>' +
    '<section class="how-it-works"><h2>Programs supported</h2><p>Internix supports the following programs (full names):</p><div class="pills">' +
      (state.catalog ? state.catalog.program_options.map((o) => '<span class="tag">' + esc(o.label) + '</span>').join('') : '') + '</div></section>' +
    '<section class="how-it-works"><h2>Data quality</h2><p>Company listings are researched from official websites, careers pages, job boards and public records. We do not fabricate companies, addresses, internships or requirements. Where information is not yet confirmed, we show it as pending verification rather than inventing it.</p></section>';
}

/* ------------------------------ router ------------------------------ */
const routes = {
  '#/': landingView,
  '#/opportunities': browseView,
  '#/browse': browseView,
  '#/companies': companiesView,
  '#/find-matches': matchView,
  '#/match': matchView,
  '#/matches': matchesView,
  '#/saved': savedView,
  '#/about': aboutView
};

async function route() {
  const hash = location.hash || '#/';
  renderNav();
  const view = routes[hash] || landingView;
  await view();
}

/* ------------------------------ boot ------------------------------ */
async function boot() {
  try { state.catalog = await api('GET', '/api/catalog'); } catch { state.catalog = { programs: [], program_options: [], skills: [], fields: [], locations: [] }; }
  try { state.companies = await api('GET', '/api/companies'); } catch {}
  try { state.opps = await api('GET', '/api/opportunities'); } catch {}
  const sp = loadProfile();
  if (sp && sp.program) state.profile = sp;
  window.addEventListener('hashchange', route);
  await route();
}

boot();
