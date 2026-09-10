'use strict';

/**
 * Internix - Program-Based Internship Matching
 * --------------------------------------------------
 * A fully local, transparent, deterministic compatibility engine. No AI, no
 * paid APIs - it uses ordinary application logic and data stored in the
 * database (programs, program relationships, the preferred/related programs
 * listed on each opportunity, and the opportunity's internship field).
 *
 * Internix is a DISCOVERY platform. This score measures "student program to
 * opportunity" compatibility so results can be ranked by relevance. It is NOT
 * a prediction of acceptance or hiring.
 *
 * The selected academic program is the primary input. Opportunities that
 * explicitly list the student's program (or a closely related program) as
 * preferred score highest. For opportunities open to all programs, the
 * opportunity's internship field is compared to the student's program fields
 * to rank relevance (e.g. a Computer Engineering student ranks above a
 * Business student for an advertised technology internship).
 *
 * Weighting (kept here so scoring stays logical & explainable):
 *   Program compatibility   : 55%
 *   Internship field overlap: 25%
 *   Location compatibility   : 10%
 *   Work arrangement         : 10%
 *   -------------------------------------------------
 *   Total                    : 100%
 */

const db = require('./db');

const WEIGHTS = {
  program: 0.55,
  field: 0.25,
  location: 0.10,
  arrangement: 0.10
};

/* Fallback related-program map, used only if the program_relationships table
   is empty (e.g. an un-seeded development database). The seed keeps the
   authoritative map in the database. Keyed by programme CODE. */
const DEFAULT_RELATED = {
  BSIT: ['COMPUTER ENGINEERING', 'BINDTECH', 'BSBA'],
  'COMPUTER ENGINEERING': ['BSIT', 'INDUSTRIAL ENGINEERING', 'BINDTECH'],
  BSBA: ['BSENTREP', 'BSIT'],
  BSENTREP: ['BSBA', 'BSIT'],
  'INDUSTRIAL ENGINEERING': ['BSBA', 'COMPUTER ENGINEERING', 'BINDTECH'],
  BINDTECH: ['BSIT', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING']
};

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function dedupe(arr) {
  return [...new Set((arr || []).map(norm).filter(Boolean))];
}

/* Database-driven related programs for a program CODE. Returns codes. */
function relatedProgramsFor(code) {
  const row = db.get('SELECT id FROM programs WHERE code = ?', code);
  if (!row) return DEFAULT_RELATED[code] || [];
  const codes = db.all(
    `SELECT p2.code FROM program_relationships r
       JOIN programs p1 ON p1.id = r.program_id
       JOIN programs p2 ON p2.id = r.related_program_id
      WHERE r.program_id = ? ORDER BY p2.code`,
    row.id
  ).map((r) => r.code);
  return codes.length ? codes : (DEFAULT_RELATED[code] || []);
}

/**
 * Program compatibility (0..1):
 *   1.0 = the opportunity explicitly prefers the student's program
 *   0.75 = the opportunity prefers a closely related program
 *   0.5 = open to all programs (no restricted list)
 *   0.25 = the opportunity prefers an unrelated program
 */
function programScore(studentCode, oppPrograms) {
  const list = dedupe(oppPrograms);
  const sc = norm(studentCode);
  if (!sc) return 0.5; // no program selected - neutral
  if (list.length === 0) return 0.5; // open to all programs - neutral
  if (list.includes(sc)) return 1.0;
  if (relatedProgramsFor(studentCode).map(norm).some((r) => list.includes(r))) return 0.75;
  return 0.25;
}

/**
 * Field alignment (0..1) - compares the opportunity's internship field to the
 * student program's field relationships (program_fields / specialization_fields).
 * Mainly used to rank opportunities advertised as open to any program.
 */
function fieldScore(profile, oppField) {
  const sf = norm(oppField);
  if (!sf) return 0.5; // no field stated - neutral
  const prog = db.get('SELECT id FROM programs WHERE code = ?', profile.program);
  if (!prog) return 0.4;

  const progFields = new Set(
    db.all(
      `SELECT lower(f.name) AS n FROM program_fields pf JOIN internship_fields f ON f.id = pf.field_id WHERE pf.program_id = ?`,
      prog.id
    ).map((r) => r.n)
  );

  if (profile.specialization) {
    db.all(
      `SELECT lower(f.name) AS n FROM specialization_fields sfi
         JOIN specializations s ON s.id = sfi.specialization_id
         JOIN internship_fields f ON f.id = sfi.field_id
        WHERE lower(s.name) = ?`, norm(profile.specialization)
    ).forEach((r) => progFields.add(r.n));
  }

  if (progFields.size === 0) return 0.4;
  if (progFields.has(sf)) return 1.0;
  const hasPartial = [...progFields].some((n) =>
    n.includes(sf) || sf.includes(n) ||
    n.split(/\s+/).some((w) => sf.includes(w)));
  return hasPartial ? 0.7 : 0.2;
}

/**
 * Location compatibility (0..1):
 *   1.0 exact, 0.8 same region (Metro Manila municipality), 0.75 Bulacan province,
 *   0.5 unknown, 0.2 otherwise.
 */
function locationScore(studentLoc, oppLoc) {
  const a = norm(studentLoc);
  const b = norm(oppLoc);
  if (!a) return 0.5;
  if (!b) return 0.5;
  if (a === b) return 1.0;
  const METRO = ['metro manila', 'manila', 'makati', 'taguig', 'pasig',
    'quezon city', 'mandaluyong', 'pasay', 'paranaque', 'muntinlupa',
    'caloocan', 'marikina', 'las pinas', 'valenzuela', 'navotas', 'malabon',
    'san juan', 'pateros'];
  const isMetro = (s) => METRO.includes(s);
  if (isMetro(a) && isMetro(b)) return 0.8;
  if (a === 'bulacan' || b === 'bulacan') return 0.75;
  return 0.2;
}

function workArrangementScore(pref, actual) {
  const a = norm(pref);
  const b = norm(actual);
  if (!a || !b) return 0.5; // preference or arrangement unknown - neutral
  if (a === b) return 1.0;
  return 0.5;
}

function clamp(pct) {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Compute the profile-to-opportunity compatibility score.
 * profile: { program (code), specialization, location, work_arrangement }
 * opp: loaded opportunity object (see loaders.loadOpportunity)
 */
function computeMatch(profile, opp) {
  profile = profile || {};
  opp = opp || {};
  const oppPrograms = opp.programs || [];

  const sc = programScore(profile.program, oppPrograms);
  const f = fieldScore(profile, opp.field);
  const lc = locationScore(profile.location, opp.location);
  const ar = workArrangementScore(profile.work_arrangement, opp.work_arrangement);

  const raw = sc * WEIGHTS.program + f * WEIGHTS.field +
              lc * WEIGHTS.location + ar * WEIGHTS.arrangement;
  const scored = clamp(raw * 100);

  /* Explainable "why this matches" checklist */
  const checks = [];

  if (oppPrograms.includes(profile.program)) {
    checks.push({ label: 'Accepts your selected program', ok: true });
  } else if (oppPrograms.length === 0) {
    checks.push({ label: 'Open to all programs (no restricted list)', ok: null });
  } else if (relatedProgramsFor(profile.program).some((r) => oppPrograms.includes(r))) {
    checks.push({ label: 'Accepts a closely related program', ok: null });
  } else {
    checks.push({ label: 'Your program is not on the preferred list', ok: false });
  }

  if (opp.field) {
    if (f >= 1.0) checks.push({ label: 'Relevant ' + opp.field + ' internship', ok: true });
    else if (f >= 0.7) checks.push({ label: 'Related to ' + opp.field + ' work', ok: null });
    else checks.push({ label: 'Internship field differs from your program', ok: false });
  } else {
    checks.push({ label: 'Internship field not specified', ok: null });
  }

  if (opp.location) {
    if (lc >= 0.75) checks.push({ label: 'Located in ' + opp.location, ok: true });
    else checks.push({ label: 'Located in ' + opp.location, ok: null });
  }

  if (opp.work_arrangement) {
    checks.push({ label: opp.work_arrangement + ' arrangement', ok: null });
  }

  return {
    score: scored,
    breakdown: { program: sc, field: f, location: lc, arrangement: ar },
    weights: WEIGHTS,
    checks,
    note: 'This score is program-to-opportunity compatibility for ranking. It is not a prediction of acceptance or hiring.'
  };
}

module.exports = {
  computeMatch,
  WEIGHTS,
  programScore,
  fieldScore,
  relatedProgramsFor
};