'use strict';

/**
 * Internix — seed data (idempotent).
 *
 * Seeds the academic catalogue (programs, specializations, skills, internship
 * fields, and the data-driven program->field / specialization->field
 * relationships) plus REAL, independently verifiable companies located in
 * Bulacan and Metro Manila.
 *
 * RULES:
 *  - No demo/sample/fake companies.
 *  - No invented internship listings. We only seed an opportunity as
 *    "verified" when the program itself can be verified from an official
 *    company source.
 *  - A real company does NOT imply a current internship opening.
 */

const db = require('./db');

function ensureProgram(code, name) {
  const existing = db.get('SELECT id FROM programs WHERE code = ?', code);
  if (existing) return existing.id;
  return db.lastInsertId(db.run('INSERT INTO programs (code, name) VALUES (?, ?)', code, name));
}

function ensureSpecialization(programId, name) {
  const existing = db.get('SELECT id FROM specializations WHERE program_id = ? AND name = ?', programId, name);
  if (existing) return existing.id;
  return db.lastInsertId(db.run('INSERT INTO specializations (program_id, name) VALUES (?, ?)', programId, name));
}

function ensureSkill(name, category) {
  const existing = db.get('SELECT id FROM skills WHERE name = ?', name);
  if (existing) return existing.id;
  return db.lastInsertId(db.run('INSERT INTO skills (name, category) VALUES (?, ?)', name, category));
}

function ensureField(name) {
  const existing = db.get('SELECT id FROM internship_fields WHERE name = ?', name);
  if (existing) return existing.id;
  return db.lastInsertId(db.run('INSERT INTO internship_fields (name) VALUES (?)', name));
}

const realCompanies = require('./companies-data.json');

function ensureCompany(data) {
  const existing = db.get('SELECT id FROM companies WHERE company_name = ?', data.company_name);
  if (existing) return existing.id;
  return db.lastInsertId(db.run(
    `INSERT INTO companies (company_name, logo_url, description, location, city, province, region,
       industry, contact_info, website, careers_url, company_size, year_established,
       verification_status, source_name, source_url, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.company_name, data.logo_url || null, data.description,
    (data.location || (data.city ? data.city + ', ' + data.province : data.province || null)),
    data.city, data.province, data.region, data.industry,
    data.contact_info || null, data.website || null, data.careers_url || null,
    data.company_size || null, data.year_established || null,
    data.verification_status || 'verified',
    data.source_name, data.source_url, data.verified_at || null
  ));
}
function seedCatalogue() {
  // Programs use FULL, human-friendly names. Acronyms are internal only.
  const programs = {
    BSBA: 'Business Administration',
    BSENTREP: 'Entrepreneurship',
    'COMPUTER ENGINEERING': 'Computer Engineering',
    'INDUSTRIAL ENGINEERING': 'Industrial Engineering',
    BINDTECH: 'Bachelor of Industrial Technology',
    BSIT: 'Information Technology'
  };
  const pid = {};
  for (const [code, name] of Object.entries(programs)) pid[code] = ensureProgram(code, name);

  // Specializations
  ensureSpecialization(pid.BINDTECH, 'Computer Technology');
  ensureSpecialization(pid.BINDTECH, 'Architectural Drafting and Digital Graphics Technology');
  ensureSpecialization(pid.BINDTECH, 'Automotive Technology');
  ensureSpecialization(pid.BINDTECH, 'Food Technology');
  ensureSpecialization(pid.BINDTECH, 'Electrical Technology');
  ensureSpecialization(pid['COMPUTER ENGINEERING'], 'Embedded Systems');
  ensureSpecialization(pid['COMPUTER ENGINEERING'], 'Microelectronics');
  ensureSpecialization(pid['INDUSTRIAL ENGINEERING'], 'Operations Research');
  ensureSpecialization(pid['INDUSTRIAL ENGINEERING'], 'Quality Management');
  ensureSpecialization(pid.BSIT, 'Software Development');
  ensureSpecialization(pid.BSIT, 'Network and Cybersecurity');
  ensureSpecialization(pid.BSBA, 'Marketing Management');

  const spec = (nm) => db.get('SELECT id FROM specializations WHERE name = ?', nm).id;

  // Internship fields (comprehensive, unique set)
  const fieldNames = [
    'Software Development', 'Web Development', 'Mobile Application Development',
    'Embedded Systems', 'Hardware Engineering', 'Hardware', 'Electronics',
    'Networking', 'Systems Administration', 'Technical Support', 'Cybersecurity',
    'Internet of Things', 'Automation', 'Computer Systems', 'Database / Systems Development',
    'IT Support', 'Cloud Computing', 'UI/UX', 'Data Management', 'Database Management',
    'Quality Assurance',
    'Business Management', 'Marketing', 'Human Resources', 'Finance', 'Accounting',
    'Operations', 'Sales', 'Business Development', 'Administrative Services',
    'Customer Relations', 'Project Management', 'Entrepreneurship', 'E-Commerce',
    'Product Development', 'Business Strategy',
    'Manufacturing', 'Production', 'Process Improvement', 'Supply Chain',
    'Logistics', 'Industrial Engineering', 'Lean Manufacturing', 'Data Analysis',
    'Facilities Planning',
    'Architectural Drafting', 'CAD', '3D Modeling', 'Digital Graphics',
    'Architectural Visualization', 'Technical Drawing', 'Graphic Design',
    'Automotive Service', 'Automotive Diagnostics', 'Vehicle Maintenance',
    'Automotive Electronics', 'Mechanical Systems',
    'Food Production', 'Food Safety', 'Food Processing', 'Laboratory Operations',
    'Electrical Systems', 'Electrical Maintenance', 'Industrial Electrical', 'Control Systems'
  ];
  const fid = {};
  for (const f of fieldNames) fid[f] = ensureField(f);

  // Program -> fields (data-driven)
  const programFields = {
    'COMPUTER ENGINEERING': [
      'Software Development', 'Web Development', 'Mobile Application Development',
      'Embedded Systems', 'Hardware Engineering', 'Electronics', 'Networking',
      'Systems Administration', 'Technical Support', 'Cybersecurity',
      'Internet of Things', 'Automation', 'Computer Systems', 'Database / Systems Development'
    ],
    BSIT: [
      'Web Development', 'Software Development', 'IT Support', 'Networking',
      'Systems Administration', 'Database Management', 'Cybersecurity',
      'Cloud Computing', 'Technical Support', 'Quality Assurance', 'UI/UX', 'Data Management'
    ],
    BSBA: [
      'Business Management', 'Marketing', 'Human Resources', 'Finance', 'Accounting',
      'Operations', 'Sales', 'Business Development', 'Administrative Services',
      'Customer Relations', 'Project Management', 'Entrepreneurship'
    ],
    BSENTREP: [
      'Business Development', 'Entrepreneurship', 'Marketing', 'Sales', 'Operations',
      'Business Management', 'E-Commerce', 'Product Development',
      'Customer Relations', 'Business Strategy'
    ],
    'INDUSTRIAL ENGINEERING': [
      'Manufacturing', 'Production', 'Quality Assurance', 'Process Improvement',
      'Supply Chain', 'Logistics', 'Operations', 'Industrial Engineering',
      'Lean Manufacturing', 'Data Analysis', 'Facilities Planning'
    ],
    BINDTECH: [] // fields come from the selected specialization
  };
  for (const [code, fs] of Object.entries(programFields)) {
    for (const f of fs) db.run('INSERT OR IGNORE INTO program_fields (program_id, field_id) VALUES (?, ?)', pid[code], fid[f]);
  }

  // Specialization -> fields (data-driven) — used for Bachelor of Industrial Technology
  const specializationFields = {
    'Computer Technology': [
      'IT Support', 'Computer Systems', 'Networking', 'Hardware',
      'Web Development', 'Software Development', 'Technical Support'
    ],
    'Architectural Drafting and Digital Graphics Technology': [
      'Architectural Drafting', 'CAD', '3D Modeling', 'Digital Graphics',
      'Architectural Visualization', 'Technical Drawing', 'Graphic Design'
    ],
    'Automotive Technology': [
      'Automotive Service', 'Automotive Diagnostics', 'Vehicle Maintenance',
      'Automotive Electronics', 'Mechanical Systems'
    ],
    'Food Technology': [
      'Food Production', 'Food Safety', 'Quality Assurance', 'Product Development',
      'Food Processing', 'Laboratory Operations'
    ],
    'Electrical Technology': [
      'Electrical Systems', 'Electrical Maintenance', 'Electronics',
      'Industrial Electrical', 'Automation', 'Control Systems'
    ]
  };
  for (const [nm, fs] of Object.entries(specializationFields)) {
    const sid = spec(nm);
    for (const f of fs) db.run('INSERT OR IGNORE INTO specialization_fields (specialization_id, field_id) VALUES (?, ?)', sid, fid[f]);
  }

  // Skills (suggestions; students may add any free-text skill)
  const skillList = [
    ['Python', 'Programming'], ['JavaScript', 'Programming'], ['HTML/CSS', 'Programming'],
    ['HTML', 'Programming'], ['CSS', 'Programming'], ['Java', 'Programming'],
    ['C/C++', 'Programming'], ['PHP', 'Programming'], ['SQL', 'Programming'],
    ['Git', 'General'], ['Linux', 'IT Operations'], ['Windows Server', 'IT Operations'],
    ['Active Directory', 'IT Operations'], ['Troubleshooting', 'IT Operations'],
    ['Network Administration', 'Networking'], ['Cisco IOS', 'Networking'],
    ['TCP/IP', 'Networking'], ['Firewalls', 'Networking'],
    ['Circuit Design', 'Hardware/Electronics'], ['PCB Layout', 'Hardware/Electronics'],
    ['Microcontrollers', 'Hardware/Electronics'], ['Embedded C', 'Hardware/Electronics'],
    ['Wiring', 'Hardware/Electronics'], ['PLC Programming', 'Hardware/Electronics'],
    ['AutoCAD', 'Engineering'], ['SolidWorks', 'Engineering'], ['MATLAB', 'Engineering'],
    ['Engineering Analysis', 'Engineering'], ['CAD/Drafting', 'Engineering'],
    ['Quality Control', 'Manufacturing'], ['Lean Manufacturing', 'Manufacturing'],
    ['MES', 'Manufacturing'], ['Food Safety Standards', 'Manufacturing'],
    ['Excel', 'Business'], ['Data Analysis', 'Business'], ['Project Management', 'Business'],
    ['Communication', 'Business'], ['Teamwork', 'General'], ['Customer Service', 'Business']
  ];
  for (const [s, cat] of skillList) ensureSkill(s, cat);
}

/**
 * Verified internship opportunities.
 *
 * Only opportunities whose program can be verified from an official company
 * source are seeded as "verified". A real company does NOT automatically have
 * a current opening — most companies in the directory intentionally have no
 * opportunity record here.
 */
function seedVerifiedOpportunities() {
  const company = db.get('SELECT id FROM companies WHERE company_name = ?', 'Accenture Philippines');
  if (!company) return;

  const existing = db.get(
    'SELECT id FROM internship_opportunities WHERE company_id = ? AND source_url = ?',
    company.id, 'https://www.accenture.com/ph-en/careers'
  );
  if (existing) return;

  const fieldId = db.get('SELECT id FROM internship_fields WHERE name = ?', 'Software Development');

  db.run(
    `INSERT INTO internship_opportunities
       (company_id, position, description, field_id, location, work_arrangement, slots,
        duration, required_hours, application_deadline, application_method, application_url,
        verification_status, source_name, source_url, verified_at, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    company.id,
    'Summer Internship & Student Program',
    "Accenture Philippines runs structured summer internship and student programs for university students across technology and consulting roles. Eligibility, timeline, and application details are published on the official Accenture Philippines careers page. Internix lists this as a verified opportunity because the program is advertised on the company's official careers page; it does not guarantee current availability.",
    fieldId ? fieldId.id : null,
    'Makati, Metro Manila',
    null, null, null, null, null, null,
    'https://www.accenture.com/ph-en/careers',
    'verified',
    'Official Company Careers Page (accenture.com/ph-en/careers)',
    'https://www.accenture.com/ph-en/careers',
    '2026-09-08',
    'open'
  );
}

function seedAll() {
  db.initSchema();
  // Clear relationship tables first (they are repopulated by seedCatalogue).
  db.exec('DELETE FROM program_fields;');
  db.exec('DELETE FROM specialization_fields;');
  seedCatalogue();
  db.exec('DELETE FROM opportunity_programs;');
  db.exec('DELETE FROM opportunity_specializations;');
  db.exec('DELETE FROM opportunity_skills;');
  db.exec('DELETE FROM internship_opportunities;');
  db.exec('DELETE FROM companies;');
  for (const c of realCompanies) ensureCompany(c);
  seedVerifiedOpportunities();
  const verifiedCount = db.get(
    "SELECT COUNT(*) AS c FROM internship_opportunities WHERE verification_status='verified'"
  ).c;
  console.log(
    '[seed] Done. ' + realCompanies.length + ' verified real companies; ' +
    verifiedCount + ' verified opportunity(ies). No demo/fake data.'
  );
}

module.exports = { seedAll };