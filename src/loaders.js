'use strict';

/**
 * Assemblers that turn normalized join tables into the rich objects used by the
 * matching engine and the API. Centralized here so every route reads a profile
 * or opportunity the same way.
 */

const db = require('./db');
const locations = require('./locations');
const programMap = require('./programMap');

// Program name -> internal code lookup (used to rebuild program codes from
// opportunity program names). Resolved per call so names added/seeded at
// runtime are always visible (module load may happen before seeding).
function namesToCodes() {
  const m = new Map();
  try {
    db.all('SELECT code, name FROM programs').forEach((p) => m.set(String(p.name).trim().toLowerCase(), p.code));
  } catch (e) { /* schema not ready yet */ }
  return m;
}

/* --------------------------- opportunities --------------------------- */

function opportunityPrograms(oppId) {
  return db.all(
    `SELECT p.code, p.name FROM opportunity_programs op
       JOIN programs p ON p.id = op.program_id
      WHERE op.opportunity_id = ? ORDER BY p.name`,
    oppId
  );
}

function opportunitySpecializations(oppId) {
  return db.all(
    `SELECT s.name FROM opportunity_specializations os
       JOIN specializations s ON s.id = os.specialization_id
      WHERE os.opportunity_id = ? ORDER BY s.name`,
    oppId
  );
}

function opportunitySkills(oppId) {
  return db.all(
    `SELECT sk.name, sk.category FROM opportunity_skills osk
       JOIN skills sk ON sk.id = osk.skill_id
      WHERE osk.opportunity_id = ? ORDER BY sk.name`,
    oppId
  );
}

function companyById(companyId) {
  const c = db.get(
    'SELECT id, company_name, logo_url, description, address, location, city, province, region, industry, contact_info, website, official_website, official_website_verified, source_status, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at, internship_status, internship_notes, last_verified_at FROM companies WHERE id = ?',
    companyId
  );
  if (!c) return null;
  const progs = db.all(
    `SELECT p.id, p.code, p.name FROM company_programs cp
       JOIN programs p ON p.id = cp.program_id
      WHERE cp.company_id = ? ORDER BY p.name`,
    companyId
  );
  return {
    ...c,
    relevant_program_ids: progs.map(p => p.id),
    relevant_program_codes: progs.map(p => p.code),
    relevant_programs: progs.map(p => p.name),
    internship_status: c.internship_status || 'unknown',
  };
}

/**
 * Assemble a full opportunity object including company and related names.
 */
function loadOpportunity(id) {
  const opp = db.get(
    `SELECT o.*, c.company_name, c.logo_url AS company_logo,
            c.verification_status AS company_verification,
            c.industry AS company_industry,
            c.address AS company_address,
            c.website AS company_website,
            c.official_website AS company_official_website,
            c.careers_url AS company_careers_url
       FROM internship_opportunities o
       JOIN companies c ON c.id = o.company_id
      WHERE o.id = ?`,
    id
  );
  if (!opp) return null;

  const field = opp.field_id
    ? db.get('SELECT name FROM internship_fields WHERE id = ?', opp.field_id)
    : null;

  // Expired = open opportunity whose verified/stated deadline has passed.
  let expired = false;
  if (opp.status === 'open' && opp.application_deadline) {
    const today = new Date().toISOString().slice(0, 10);
    expired = String(opp.application_deadline).slice(0, 10) < today;
  }

  return {
    id: opp.id,
    company_id: opp.company_id,
    company_name: opp.company_name,
    company_logo: opp.company_logo,
    company_verification: opp.company_verification,
    company_address: opp.company_address || null,
    company_website: opp.company_website || null,
    company_official_website: opp.company_official_website || null,
    company_careers_url: opp.company_careers_url || null,
    position: opp.position,
    description: opp.description,
    field: field ? field.name : null,
    field_id: opp.field_id,
    location: opp.location,
    work_arrangement: opp.work_arrangement,
    slots: opp.slots,
    duration: opp.duration,
    required_hours: opp.required_hours,
    application_deadline: opp.application_deadline,
    application_method: opp.application_method,
    application_url: opp.application_url || null,
    verification_status: opp.verification_status || 'needs_review',
    source_name: opp.source_name || null,
    source_url: opp.source_url || null,
    verified_at: opp.verified_at || null,
    last_verified_at: opp.last_verified_at || null,
    status: opp.status,
    is_expired: expired,
    date_posted: opp.date_posted,
    municipality: opp.municipality || null,
    city: opp.city || null,
    province: opp.province || null,
    region: opp.region || null,
    _loc: locations.parseLocation({
      municipality: opp.municipality || null,
      city: opp.city || null,
      province: opp.province || null,
      raw: opp.location
    }),
    programs: opportunityPrograms(id).map((p) => p.code),
    program_names: opportunityPrograms(id).map((p) => p.name),
    specializations: opportunitySpecializations(id).map((s) => s.name),
    skills: opportunitySkills(id).map((s) => s.name)
  };
}

function loadAllOpenOpportunities() {
  const rows = db.all('SELECT id FROM internship_opportunities WHERE status = \'open\' ORDER BY date_posted DESC');
  return rows.map((r) => loadOpportunity(r.id));
}

/* ----------------------------- companies ----------------------------- */

function loadAllCompanies() {
  const rows = db.all('SELECT id FROM companies ORDER BY company_name');
  return rows.map((r) => {
    const c = db.get(
      'SELECT id, company_name, logo_url, description, address, location, municipality, city, province, region, industry, contact_info, website, official_website, official_website_verified, source_status, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at, internship_status, internship_notes, last_verified_at FROM companies WHERE id = ?',
      r.id
    );
    const openCount = db.get(
      `SELECT COUNT(*) AS c FROM internship_opportunities
        WHERE company_id = ? AND status = 'open'`, r.id
    ).c;
    const verifiedCount = db.get(
      `SELECT COUNT(*) AS c FROM internship_opportunities
        WHERE company_id = ? AND status = 'open' AND verification_status = 'verified'`, r.id
    ).c;
    // Relevant programs from BOTH company_programs table AND the company's non-expired open opportunities.
    const cpRows = db.all(
      `SELECT p.code, p.name FROM company_programs cp
         JOIN programs p ON p.id = cp.program_id
        WHERE cp.company_id = ?`,
      r.id
    );
    const cpCodes = cpRows.map(r => r.code);
    const cpNames = cpRows.map(r => r.name);
    // Relevant programs from the company's non-expired open opportunities.
    const oppRows = db.all(
      `SELECT o.id FROM internship_opportunities o
        WHERE o.company_id = ? AND o.status = 'open'`, r.id
    );
    const progNames = new Set(cpNames);
    const specNames = new Set();
    for (const o of oppRows) {
      const full = loadOpportunity(o.id);
      if (!full) continue;
      (full.program_names || []).forEach((n) => progNames.add(n));
      (full.specializations || []).forEach((n) => specNames.add(n));
    }
    const hasOpen = openCount > 0;
    // Program codes supported by the company's own opportunities (authoritative)
    // unioned with any directory-level tags.
    const nameMap = namesToCodes();
    const oppProgramCodes = [...progNames].map((n) => nameMap.get(String(n).trim().toLowerCase()));
    const relevantCodes = [...new Set([...cpCodes, ...oppProgramCodes].filter(Boolean))];
    return {
      ...c,
      open_opportunities: openCount,
      verified_opportunities: verifiedCount,
      has_verified_opening: verifiedCount > 0,
      relevant_programs: [...progNames],
      relevant_specializations: [...specNames],
      internship_availability: hasOpen ? 'available' : 'company_only',
      internship_status: c ? (c.internship_status || 'unknown') : 'unknown',
      relevant_program_codes: relevantCodes,
      municipality: c.municipality || null,
      _loc: locations.parseLocation({
        municipality: c.municipality || null,
        city: c.city || null,
        province: c.province || null,
        raw: c.location
      })
    };
  });
}

/* ----------------------------- students ----------------------------- */

function studentProfile(studentId) {
  const s = db.get('SELECT * FROM students WHERE id = ?', studentId);
  if (!s) return null;
  const program = s.program_id ? db.get('SELECT * FROM programs WHERE id = ?', s.program_id) : null;
  const specialization = s.specialization_id
    ? db.get('SELECT * FROM specializations WHERE id = ?', s.specialization_id)
    : null;
  const preferredField = s.preferred_field_id
    ? db.get('SELECT name FROM internship_fields WHERE id = ?', s.preferred_field_id)
    : null;

  const skills = db.all(
    `SELECT sk.name FROM student_skills ss JOIN skills sk ON sk.id = ss.skill_id
      WHERE ss.student_id = ? ORDER BY sk.name`, studentId).map((r) => r.name);
  const interests = db.all(
    `SELECT f.name FROM student_interests si JOIN internship_fields f ON f.id = si.field_id
      WHERE si.student_id = ? ORDER BY f.name`, studentId).map((r) => r.name);

  return {
    id: s.id,
    user_id: s.user_id,
    full_name: s.full_name,
    program_id: s.program_id,
    program: program ? program.code : null,
    program_name: program ? program.name : null,
    specialization_id: s.specialization_id,
    specialization: specialization ? specialization.name : null,
    preferred_field_id: s.preferred_field_id,
    preferred_field: preferredField ? preferredField.name : null,
    preferred_location: s.preferred_location,
    work_arrangement: s.work_arrangement,
    internship_duration: s.internship_duration,
    skills,
    interests
  };
}

function studentIdForUser(userId) {
  const s = db.get('SELECT id FROM students WHERE user_id = ?', userId);
  return s ? s.id : null;
}

/**
 * Resolve a program key (a program code, a full program name, or a
 * specialization name) into { program_id, code, name, specialization }.
 * The BINDTECH specialization names (e.g. "Computer Technology") resolve to
 * their parent program (BINDTECH) with the specialization attached.
 */
function resolveProgramKey(key) {
  if (!key) return null;
  const s = String(key).trim();
  const byCode = db.get('SELECT id, code, name FROM programs WHERE code = ?', s);
  if (byCode) return { program_id: byCode.id, code: byCode.code, name: byCode.name, specialization: null };
  const byName = db.get('SELECT id, code, name FROM programs WHERE lower(name) = lower(?)', s);
  if (byName) return { program_id: byName.id, code: byName.code, name: byName.name, specialization: null };
  const spec = db.get(
    `SELECT s.name AS spec, p.id AS program_id, p.code, p.name
       FROM specializations s JOIN programs p ON p.id = s.program_id
      WHERE lower(s.name) = lower(?)`, s
  );
  if (spec) return { program_id: spec.program_id, code: spec.code, name: spec.name, specialization: spec.spec };

  // Also check specializations by name (for BINDTECH specializations and others)
  const specName = db.get(
    `SELECT s.name AS spec, p.id AS program_id, p.code, p.name
       FROM specializations s JOIN programs p ON p.id = s.program_id
      WHERE lower(s.name) = lower(?)`, s
  );
  if (specName) return { program_id: specName.program_id, code: specName.code, name: specName.name, specialization: specName.spec };

  return null;
}

/**
 * The user-selectable programs shown with FULL names (never acronyms).
 * Driven by the programMap so the 10 supported programs appear as their full,
 * human-friendly names while retaining their internal codes for matching.
 */
function listProgramOptions() {
  const options = [];
  for (const code of programMap.SELECTABLE) {
    const p = db.get('SELECT id, code, name FROM programs WHERE code = ?', code);
    if (!p) continue;
    options.push({
      value: code,
      label: programMap.displayName(code),
      program_code: code,
      program_id: p.id,
      specialization: null
    });
  }
  return options;
}

// Grouped location options for the UI (Bulacan + Metro Manila + municipalities).
const LOCATIONS = locations.groupLocations();

module.exports = {
  loadOpportunity,
  loadAllOpenOpportunities,
  loadAllCompanies,
  studentProfile,
  studentIdForUser,
  resolveProgramKey,
  listProgramOptions,
  LOCATIONS
};