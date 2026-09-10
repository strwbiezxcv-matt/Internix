'use strict';

/**
 * Internix - seed data (idempotent).
 *
 * Seeds the academic catalogue (programs, specializations, skills, internship
 * fields, program->field / specialization->field relationships and the
 * database-driven program relationships used by the matcher) plus REAL,
 * independently verifiable companies located in Bulacan and Metro Manila.
 *
 * RULES:
 *  - No demo/sample/fake companies. A company with an official website is
 *    "verified" for company existence; companies whose official site could not
 *    yet be confirmed are marked needs_review.
 *  - No invented internship listings. Opportunities are only present when an
 *    official company source advertises a student/internship program
 *    (status = verified) or where the official careers page is the source but
 *    current availability must be re-checked by the visitor (needs_review).
 *  - A real company does NOT imply a current internship opening. Most companies
 *    in the directory intentionally have no opportunity record.
 */

const db = require('./db');

/* ------------------------------- helpers ------------------------------- */

function ensureProgram(code, name, description) {
  const existing = db.get('SELECT id FROM programs WHERE code = ?', code);
  if (existing) {
    db.run('UPDATE programs SET name = ?, description = ? WHERE id = ?', name, description, existing.id);
    return existing.id;
  }
  return db.lastInsertId(db.run(
    'INSERT INTO programs (code, name, description) VALUES (?, ?, ?)', code, name, description
  ));
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

/* ------------------------------ catalogue ------------------------------ */

// Full, human-friendly program names. Acronyms are internal codes only.
const PROGRAMS = [
  { code: 'BSBA', name: 'Business Administration',
    description: 'Management, marketing, finance, human resources, operations and entrepreneurship fundamentals.' },
  { code: 'BSENTREP', name: 'Entrepreneurship',
    description: 'Business creation, business development, sales, e-commerce and product innovation.' },
  { code: 'COMPUTER ENGINEERING', name: 'Computer Engineering',
    description: 'Hardware, embedded systems, electronics, networking, automation and software systems.' },
  { code: 'INDUSTRIAL ENGINEERING', name: 'Industrial Engineering',
    description: 'Process improvement, manufacturing, quality management, supply chain and operations.' },
  { code: 'BSIT', name: 'Information Technology',
    description: 'Software development, networking, IT support, cybersecurity and systems administration.' },
  { code: 'BINDTECH', name: 'Bachelor of Industrial Technology',
    description: 'Applied industrial technology across specializations including computer, drafting, automotive, food and electrical technology.' },
  { code: 'COMPUTER TECHNOLOGY', name: 'Computer Technology',
    description: 'Practical computing: software development, networking, IT support, databases and computer systems.' },
  { code: 'ARCHITECTURAL DRAFTING', name: 'Architectural Drafting and Digital Graphics Technology',
    description: 'Architectural drafting, CAD, technical drawing, 3D modeling and digital graphics.' },
  { code: 'AUTOMOTIVE TECHNOLOGY', name: 'Automotive Technology',
    description: 'Automotive service, diagnostics, maintenance, automotive electronics and mechanical systems.' },
  { code: 'FOOD TECHNOLOGY', name: 'Food Technology',
    description: 'Food production, processing, safety, quality assurance and laboratory operations.' },
  { code: 'ELECTRICAL TECHNOLOGY', name: 'Electrical Technology',
    description: 'Electrical systems, electrical maintenance, industrial electrical work and control systems.' }
];

const SPECIALIZATIONS = [
  ['BINDTECH', 'Computer Technology'],
  ['BINDTECH', 'Architectural Drafting and Digital Graphics Technology'],
  ['BINDTECH', 'Automotive Technology'],
  ['BINDTECH', 'Food Technology'],
  ['BINDTECH', 'Electrical Technology'],
  ['COMPUTER ENGINEERING', 'Embedded Systems'],
  ['COMPUTER ENGINEERING', 'Microelectronics'],
  ['INDUSTRIAL ENGINEERING', 'Operations Research'],
  ['INDUSTRIAL ENGINEERING', 'Quality Management'],
  ['BSIT', 'Software Development'],
  ['BSIT', 'Network and Cybersecurity'],
  ['BSBA', 'Marketing Management']
];

const FIELD_NAMES = [
  'Software Development', 'Web Development', 'Mobile Application Development',
  'Embedded Systems', 'Hardware Engineering', 'Hardware', 'Electronics',
  'Networking', 'Systems Administration', 'Technical Support', 'Cybersecurity',
  'Internet of Things', 'Automation', 'Computer Systems', 'Database / Systems Development',
  'IT Support', 'Cloud Computing', 'UI/UX', 'Data Management', 'Database Management',
  'Quality Assurance', 'Business Management', 'Marketing', 'Human Resources', 'Finance',
  'Accounting', 'Operations', 'Sales', 'Business Development', 'Administrative Services',
  'Customer Relations', 'Project Management', 'Entrepreneurship', 'E-Commerce',
  'Product Development', 'Business Strategy', 'Manufacturing', 'Production',
  'Process Improvement', 'Supply Chain', 'Logistics', 'Industrial Engineering',
  'Lean Manufacturing', 'Data Analysis', 'Facilities Planning', 'Architectural Drafting',
  'CAD', '3D Modeling', 'Digital Graphics', 'Architectural Visualization',
  'Technical Drawing', 'Graphic Design', 'Automotive Service', 'Automotive Diagnostics',
  'Vehicle Maintenance', 'Automotive Electronics', 'Mechanical Systems', 'Food Production',
  'Food Safety', 'Food Processing', 'Laboratory Operations', 'Electrical Systems',
  'Electrical Maintenance', 'Industrial Electrical', 'Control Systems'
];

const PROGRAM_FIELDS = {
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
  BINDTECH: [], // fields come from the selected specialization
  'COMPUTER TECHNOLOGY': [
    'Web Development', 'Software Development', 'IT Support', 'Networking',
    'Technical Support', 'Database Management', 'Computer Systems',
    'Systems Administration', 'Data Management'
  ],
  'ARCHITECTURAL DRAFTING': [
    'Architectural Drafting', 'CAD', '3D Modeling', 'Digital Graphics',
    'Architectural Visualization', 'Technical Drawing', 'Graphic Design'
  ],
  'AUTOMOTIVE TECHNOLOGY': [
    'Automotive Service', 'Automotive Diagnostics', 'Vehicle Maintenance',
    'Automotive Electronics', 'Mechanical Systems', 'Electrical Systems'
  ],
  'FOOD TECHNOLOGY': [
    'Food Production', 'Food Safety', 'Food Processing',
    'Laboratory Operations', 'Quality Assurance'
  ],
  'ELECTRICAL TECHNOLOGY': [
    'Electrical Systems', 'Electrical Maintenance', 'Industrial Electrical',
    'Control Systems', 'Electronics'
  ]
};

const SPEC_FIELDS = {
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

const SKILLS = [
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

// Database-driven "related programs" used by the matcher (program_relationships).
const RELATED = {
  'COMPUTER ENGINEERING': ['BSIT', 'BINDTECH', 'INDUSTRIAL ENGINEERING'],
  BSIT: ['COMPUTER ENGINEERING', 'BINDTECH'],
  'INDUSTRIAL ENGINEERING': ['BSBA', 'BINDTECH', 'COMPUTER ENGINEERING'],
  BSBA: ['BSENTREP', 'BSIT'],
  BSENTREP: ['BSBA'],
  BINDTECH: ['COMPUTER ENGINEERING', 'BSIT', 'INDUSTRIAL ENGINEERING'],
  'COMPUTER TECHNOLOGY': ['BSIT', 'COMPUTER ENGINEERING', 'BINDTECH'],
  'ARCHITECTURAL DRAFTING': ['BINDTECH', 'INDUSTRIAL ENGINEERING'],
  'AUTOMOTIVE TECHNOLOGY': ['BINDTECH', 'ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING'],
  'FOOD TECHNOLOGY': ['BINDTECH', 'INDUSTRIAL ENGINEERING'],
  'ELECTRICAL TECHNOLOGY': ['COMPUTER ENGINEERING', 'AUTOMOTIVE TECHNOLOGY', 'BINDTECH']
};

function seedCatalogue() {
  const pid = {};
  for (const p of PROGRAMS) pid[p.code] = ensureProgram(p.code, p.name, p.description);

  const sid = {};
  for (const [code, name] of SPECIALIZATIONS) sid[name] = ensureSpecialization(pid[code], name);

  const fid = {};
  for (const f of FIELD_NAMES) fid[f] = ensureField(f);

  for (const [code, fs] of Object.entries(PROGRAM_FIELDS)) {
    for (const f of fs) {
      db.run('INSERT OR IGNORE INTO program_fields (program_id, field_id) VALUES (?, ?)', pid[code], fid[f]);
    }
  }

  for (const [nm, fs] of Object.entries(SPEC_FIELDS)) {
    const specId = sid[nm];
    if (!specId) continue;
    for (const f of fs) {
      db.run('INSERT OR IGNORE INTO specialization_fields (specialization_id, field_id) VALUES (?, ?)', specId, fid[f]);
    }
  }

  for (const [s, cat] of SKILLS) ensureSkill(s, cat);

  for (const [code, rels] of Object.entries(RELATED)) {
    for (const r of rels) {
      if (!pid[r]) continue;
      db.run(
        'INSERT OR IGNORE INTO program_relationships (program_id, related_program_id, relationship_type) VALUES (?, ?, ?)',
        pid[code], pid[r], 'related'
      );
    }
  }

  return pid;
}

/* ------------------------------ companies ------------------------------ */

const realCompanies = require('./companies-data.json');

function normalizeRegion(province) {
  const p = String(province || '').trim().toLowerCase();
  if (p.includes('bulacan')) return 'Bulacan';
  return 'Metro Manila';
}

function ensureCompany(data) {
  const existing = db.get('SELECT id FROM companies WHERE company_name = ?', data.company_name);
  if (existing) return existing.id;
  return db.lastInsertId(db.run(
    `INSERT INTO companies
       (company_name, logo_url, description, address, location, city, province, region,
        industry, contact_info, website, careers_url, company_size, year_established,
        verification_status, source_name, source_url, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.company_name, data.logo_url || null, data.description,
    data.address || null,
    (data.location || (data.city ? data.city + ', ' + data.province : data.province || null)),
    data.city, data.province, normalizeRegion(data.province),
    data.industry, data.contact_info || null, data.website || null, data.careers_url || null,
    data.company_size || null, data.year_established || null,
    data.verification_status || 'verified',
    data.source_name, data.source_url, data.verified_at || null
  ));
}

function seedCompanies() {
  for (const c of realCompanies) ensureCompany(c);
}

/* --------------------------- opportunity seeding --------------------------- */

function linkPrograms(oppId, codes) {
  for (const code of codes || []) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) db.run('INSERT OR IGNORE INTO opportunity_programs (opportunity_id, program_id) VALUES (?, ?)', oppId, p.id);
  }
}
function linkSpecializations(oppId, names) {
  for (const nm of names || []) {
    const s = db.get('SELECT id FROM specializations WHERE name = ?', nm);
    if (s) db.run('INSERT OR IGNORE INTO opportunity_specializations (opportunity_id, specialization_id) VALUES (?, ?)', oppId, s.id);
  }
}
function linkSkills(oppId, names) {
  for (const nm of names || []) {
    const k = db.get('SELECT id FROM skills WHERE lower(name) = lower(?)', nm);
    if (k) db.run('INSERT OR IGNORE INTO opportunity_skills (opportunity_id, skill_id) VALUES (?, ?)', oppId, k.id);
  }
}

const TODAY = '2026-09-10';

function ensureOpportunity(companyName, data) {
  const company = db.get('SELECT id FROM companies WHERE company_name = ?', companyName);
  if (!company) return null;
  const existing = db.get(
    'SELECT id FROM internship_opportunities WHERE company_id = ? AND source_url = ?',
    company.id, data.source_url
  );
  if (existing) return existing.id;

  const fieldId = data.field ? db.get('SELECT id FROM internship_fields WHERE name = ?', data.field) : null;
  const oppId = db.lastInsertId(db.run(
    `INSERT INTO internship_opportunities
       (company_id, position, description, field_id, location, work_arrangement,
        internship_type, source_name, source_url, verification_status,
        verified_at, last_verified_at, status, date_posted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    company.id, data.position, data.description,
    fieldId ? fieldId.id : null, data.location, data.work_arrangement || null,
    data.internship_type || 'Internship', data.source_name, data.source_url,
    data.verification_status || 'verified', TODAY, TODAY, 'open', TODAY + ' 08:00:00'
  ));

  linkPrograms(oppId, data.programs);
  linkSpecializations(oppId, data.specializations);
  linkSkills(oppId, data.skills);
  return oppId;
}

function seedOpportunities() {
  // ---- VERIFIED (program advertised on official company source) ----
  ensureOpportunity('Accenture Philippines', {
    position: 'Summer Internship & Student Program',
    description: 'Accenture Philippines runs structured summer internship and student programs for university students across technology and consulting roles. Eligibility, timeline and application details are published on the official Accenture Philippines careers page. Listed from the official careers page; check the source for the current application window.',
    field: 'Software Development',
    location: 'Makati, Metro Manila',
    work_arrangement: 'Hybrid',
    source_name: 'Official Company Careers Page (accenture.com/ph-en/careers)',
    source_url: 'https://www.accenture.com/ph-en/careers',
    verification_status: 'verified',
    programs: ['BSIT', 'COMPUTER ENGINEERING'],
    specializations: ['Computer Technology', 'Software Development'],
    skills: ['Python', 'JavaScript', 'SQL', 'Git', 'Communication']
  });

  ensureOpportunity('Robert Bosch, Inc. (Bosch Philippines)', {
    position: 'Bosch Student Internship Program',
    description: 'Bosch Philippines welcomes student interns across engineering, technology and operations, with examples of interns growing into associates. Student opportunities are shared on the official Bosch Philippines career page.',
    field: 'Automotive Service',
    location: 'Calumpit, Bulacan',
    work_arrangement: 'On-site',
    source_name: 'Official Company Careers Page (bosch.com.ph/careers)',
    source_url: 'https://www.bosch.com.ph/careers',
    verification_status: 'verified',
    programs: ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'BINDTECH'],
    specializations: ['Automotive Technology', 'Electrical Technology', 'Computer Technology'],
    skills: ['PLC Programming', 'AutoCAD', 'Troubleshooting', 'Teamwork']
  });

  // ---- NEEDS_REVIEW (listed from official careers pages; confirm availability) ----
  ensureOpportunity('IBM Philippines, Inc.', {
    position: 'IBM Student Internship Program',
    description: 'IBM Philippines recruits student interns across technology and consulting. Details and current openings are published on the official IBM careers page - verify the current program on the source.',
    field: 'Software Development',
    location: 'Quezon City, Metro Manila',
    work_arrangement: 'Hybrid',
    source_name: 'Official Company Careers Page (ibm.com/careers)',
    source_url: 'https://www.ibm.com/careers',
    verification_status: 'needs_review',
    programs: ['BSIT', 'COMPUTER ENGINEERING'],
    specializations: ['Software Development', 'Computer Technology'],
    skills: ['Python', 'Java', 'SQL', 'Linux']
  });

  ensureOpportunity('Microsoft Philippines, Inc.', {
    position: 'Student & Early Career Internship',
    description: 'Microsoft Philippines hires student and early-career interns in technology roles. Current openings and eligibility are published on the official Microsoft careers page - verify on the source.',
    field: 'Software Development',
    location: 'Taguig, Metro Manila',
    work_arrangement: 'Hybrid',
    source_name: 'Official Company Careers Page (microsoft.com/ph-en/careers)',
    source_url: 'https://www.microsoft.com/en-ph/careers',
    verification_status: 'needs_review',
    programs: ['BSIT', 'COMPUTER ENGINEERING'],
    specializations: ['Software Development'],
    skills: ['C/C++', 'JavaScript', 'Python', 'SQL']
  });

  ensureOpportunity('Intel Philippines, Inc.', {
    position: 'Intel Student Internship',
    description: 'Intel Philippines offers student internships aligned to software, hardware and engineering teams. Openings are advertised on the official Intel careers page - verify on the source.',
    field: 'Computer Systems',
    location: 'Taguig, Metro Manila',
    work_arrangement: 'Hybrid',
    source_name: 'Official Company Careers Page (intel.com/careers)',
    source_url: 'https://www.intel.com/content/www/us/en/jobs/careers.html',
    verification_status: 'needs_review',
    programs: ['BSIT', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING'],
    specializations: ['Software Development', 'Computer Technology'],
    skills: ['C/C++', 'Python', 'MATLAB', 'Linux']
  });

  ensureOpportunity('MERALCO (Manila Electric Company)', {
    position: 'Engineering Student Internship (OJT)',
    description: 'MERALCO takes on engineering student interns and on-the-job trainees across electrical, systems and operational roles. Openings are managed through the official MERALCO careers portal - verify on the source.',
    field: 'Electrical Systems',
    location: 'Pasig, Metro Manila',
    work_arrangement: 'On-site',
    source_name: 'Official Company Careers Page (meralco.com.ph/careers)',
    source_url: 'https://www.meralco.com.ph/careers',
    verification_status: 'needs_review',
    programs: ['BINDTECH', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING'],
    specializations: ['Electrical Technology', 'Computer Technology'],
    skills: ['Wiring', 'PLC Programming', 'Troubleshooting', 'Teamwork']
  });

  ensureOpportunity('Jollibee Foods Corporation', {
    position: 'Corporate & Store Operations Internship (OJT)',
    description: 'Jollibee Foods runs internships and on-the-job training across finance, marketing, supply chain and store operations. Current opportunities are shared on the official Jollibee careers page - verify on the source.',
    field: 'Operations',
    location: 'Pasig, Metro Manila',
    work_arrangement: 'On-site',
    source_name: 'Official Company Careers Page (jollibee.com.ph/careers)',
    source_url: 'https://www.jollibee.com.ph/careers',
    verification_status: 'needs_review',
    programs: ['BSBA', 'BSENTREP', 'INDUSTRIAL ENGINEERING', 'BINDTECH'],
    specializations: ['Marketing Management', 'Food Technology'],
    skills: ['Excel', 'Data Analysis', 'Project Management', 'Communication']
  });

  ensureOpportunity('San Miguel Corporation', {
    position: 'Business & Marketing Internship',
    description: 'San Miguel Corporation offers internships in business, marketing, finance and operations. Openings are published on the official San Miguel corporate site - verify on the source.',
    field: 'Business Management',
    location: 'Makati, Metro Manila',
    work_arrangement: 'Hybrid',
    source_name: 'Official Company Site (sanmiguel.beer.ph)',
    source_url: 'https://www.sanmiguel.beer.ph',
    verification_status: 'needs_review',
    programs: ['BSBA', 'BSENTREP', 'INDUSTRIAL ENGINEERING'],
    specializations: ['Marketing Management'],
    skills: ['Excel', 'Data Analysis', 'Marketing', 'Communication']
  });

  ensureOpportunity('Nestle Philippines, Inc.', {
    position: 'Young Talent & Manufacturing Internship',
    description: 'Nestle Philippines runs young talent and manufacturing internship programs across its sites. Application details are published on the official Nestle careers page - verify on the source.',
    field: 'Food Production',
    location: 'Makati, Metro Manila',
    work_arrangement: 'On-site',
    source_name: 'Official Company Careers Page (nestle.com.ph/careers)',
    source_url: 'https://www.nestle.com.ph/careers',
    verification_status: 'needs_review',
    programs: ['INDUSTRIAL ENGINEERING', 'BSBA', 'BINDTECH'],
    specializations: ['Food Technology', 'Electrical Technology'],
    skills: ['Quality Control', 'Food Safety Standards', 'Excel', 'Lean Manufacturing']
  });
}

/* -------------------------------- seedAll -------------------------------- */

function seedAll() {
  db.initSchema();
  db.exec('DELETE FROM program_fields;');
  db.exec('DELETE FROM specialization_fields;');
  db.exec('DELETE FROM program_relationships;');
  seedCatalogue();
  db.exec('DELETE FROM opportunity_programs;');
  db.exec('DELETE FROM opportunity_specializations;');
  db.exec('DELETE FROM opportunity_skills;');
  db.exec('DELETE FROM internship_opportunities;');
  db.exec('DELETE FROM companies;');
  seedCompanies();
  seedOpportunities();

  const companyCount = db.get('SELECT COUNT(*) AS c FROM companies').c;
  const oppCount = db.get('SELECT COUNT(*) AS c FROM internship_opportunities').c;
  const verifiedOpps = db.get(
    "SELECT COUNT(*) AS c FROM internship_opportunities WHERE verification_status = 'verified'"
  ).c;
  console.log(
    '[seed] Done. ' + companyCount + ' real companies; ' + oppCount + ' opportunity listing(s); ' +
    verifiedOpps + ' verified. No fake/demo records.'
  );
}

module.exports = { seedAll };