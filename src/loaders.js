'use strict';

/**
 * Assemblers that turn normalized join tables into the rich objects used by the
 * matching engine and the API. Centralized here so every route reads a profile
 * or opportunity the same way.
 */

const db = require('./db');

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
  return db.get(
    'SELECT id, company_name, logo_url, description, location, city, province, region, industry, website, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at FROM companies WHERE id = ?',
    companyId
  );
}

/**
 * Assemble a full opportunity object including company and related names.
 */
function loadOpportunity(id) {
  const opp = db.get(
    `SELECT o.*, c.company_name, c.logo_url AS company_logo,
            c.verification_status AS company_verification,
            c.industry AS company_industry,
            c.website AS company_website
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
    verification_status: opp.verification_status || 'demo',
    source_name: opp.source_name || null,
    source_url: opp.source_url || null,
    verified_at: opp.verified_at || null,
    status: opp.status,
    is_expired: expired,
    date_posted: opp.date_posted,
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
      'SELECT id, company_name, logo_url, description, location, city, province, region, industry, website, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at FROM companies WHERE id = ?',
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
    return {
      ...c,
      open_opportunities: openCount,
      verified_opportunities: verifiedCount,
      has_verified_opening: verifiedCount > 0
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

module.exports = {
  loadOpportunity,
  loadAllOpenOpportunities,
  loadAllCompanies,
  studentProfile,
  studentIdForUser
};