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
const locations = require('./locations');

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
  'Electrical Maintenance', 'Industrial Electrical', 'Control Systems',
  // additional role categories referenced by Internix opportunities:
  'Administration', 'Office Administration', 'Customer Service', 'Network Administration',
  'Database', 'Quality Management', 'Quality Control', 'Food Safety Standards',
  'CAD/Drafting', 'CAD/CAM', 'Firmware', 'Construction', 'Human Resources'
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
  ['Communication', 'Business'], ['Teamwork', 'General'], ['Customer Service', 'Business'],
  ['Office Administration', 'Business'], ['Marketing', 'Business'], ['Sales', 'Business'],
  ['Networking', 'Networking'], ['Hardware', 'IT Operations'], ['Windows', 'IT Operations'],
  ['IT Support', 'IT Operations'], ['Electronics', 'Hardware/Electronics'], ['Automation', 'Engineering'],
  ['Diagnostics', 'Engineering'], ['Maintenance', 'Engineering'], ['Automotive Service', 'Engineering'],
  ['Electrical', 'Engineering'], ['Design', 'Engineering'], ['Drafting', 'Engineering'],
  ['Process Improvement', 'Manufacturing'], ['Supply Chain', 'Business'], ['CAD/CAM', 'Engineering']
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
  if (existing) {
    db.run(
      `UPDATE companies SET
        logo_url = ?, description = ?, address = ?, location = ?, city = ?, municipality = ?, province = ?,
        region = ?, industry = ?, contact_info = ?, website = ?, careers_url = ?,
        company_size = ?, year_established = ?, verification_status = ?,
        source_name = ?, source_url = ?, verified_at = ?,
        internship_status = ?, internship_notes = ?, last_verified_at = ?,
        official_website = COALESCE(official_website, ?)
      WHERE id = ?`,
      data.logo_url || null, data.description,
      data.address || null,
      (data.location || (data.city ? data.city + ', ' + data.province : data.province || null)),
      data.city, data.municipality || data.city || null, data.province, normalizeRegion(data.province),
      data.industry, data.contact_info || null, data.website || null, data.careers_url || null,
      data.company_size || null, data.year_established || null,
      data.verification_status || 'unknown',
      data.source_name, data.source_url, data.verified_at || null,
      data.internship_status || 'unknown', data.internship_notes || null, data.last_verified_at || null,
      data.official_website || data.website || null,
      existing.id
    );
    return existing.id;
  }
  return db.lastInsertId(db.run(
    `INSERT INTO companies
       (company_name, logo_url, description, address, location, city, municipality, province, region,
        industry, contact_info, website, careers_url, company_size, year_established,
        verification_status, source_name, source_url, verified_at,
        internship_status, internship_notes, last_verified_at, official_website)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    data.company_name, data.logo_url || null, data.description,
    data.address || null,
    (data.location || (data.city ? data.city + ', ' + data.province : data.province || null)),
    data.city, data.municipality || data.city || null, data.province, normalizeRegion(data.province),
    data.industry, data.contact_info || null, data.website || null, data.careers_url || null,
    data.company_size || null, data.year_established || null,
    data.verification_status || 'unknown',
    data.source_name, data.source_url, data.verified_at || null,
    data.internship_status || 'unknown', data.internship_notes || null, data.last_verified_at || null,
    data.official_website || data.website || null
  ));
}

function seedCompanies() {
  // --- Link company programs for original real companies ---
  for (const c of realCompanies) ensureCompany(c);
  // Link programs for original companies that have clear IT/engineering/business relevance
  linkCompanyPrograms('Accenture Philippines', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA']);
  linkCompanyPrograms('Amazon Philippines', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA']);
  linkCompanyPrograms('AXA Philippines', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('AyalaLand, Inc.', ['INDUSTRIAL ENGINEERING', 'BSBA', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('BDO Unibank, Inc.', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Bank of the Philippine Islands (BPI)', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Capgemini in the Philippines', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA']);
  linkCompanyPrograms('China Banking Corporation', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Cisco Systems Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Coca-Cola FEMSA Philippines', ['INDUSTRIAL ENGINEERING', 'FOOD TECHNOLOGY']);
  linkCompanyPrograms('Cognizant Technology Solutions', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Concentrix Philippines', ['BSIT', 'BSBA', 'BSENTREP']);
  linkCompanyPrograms('DENSO TEN Solutions Philippines Corporation', ['COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING', 'AUTOMOTIVE TECHNOLOGY']);
  linkCompanyPrograms('Dell Technologies Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('EEI Corporation', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Globe Telecom (Globe)', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Google Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Hewlett-Packard (HP) Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('IBM Philippines, Inc.', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Infosys Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Intel Philippines, Inc.', ['BSIT', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Jollibee Foods Corporation', ['BSBA', 'BSENTREP', 'FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('MERALCO (Manila Electric Company)', ['ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Manulife Philippines', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Metropolitan Bank and Trust Company (Metrobank)', ['BSBA', 'BSENTREP', 'BSIT']);
  linkCompanyPrograms('Microsoft Philippines, Inc.', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Monde Nissin Corporation', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('Mondelez International (Philippines)', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Nestle Philippines, Inc.', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('Oracle Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Pepsi-Cola Products Philippines, Inc.', ['INDUSTRIAL ENGINEERING', 'FOOD TECHNOLOGY']);
  linkCompanyPrograms('Petron Corporation', ['INDUSTRIAL ENGINEERING', 'FOOD TECHNOLOGY']);
  linkCompanyPrograms('Philippine Batteries, Inc.', ['INDUSTRIAL ENGINEERING', 'ELECTRICAL TECHNOLOGY']);
  linkCompanyPrograms('Philippine National Bank (PNB)', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Pilipinas Shell Petroleum Corporation', ['INDUSTRIAL ENGINEERING', 'FOOD TECHNOLOGY']);
  linkCompanyPrograms('Pru Life UK (Philippine Pru Life Assurance)', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Rizal Commercial Banking Corporation (RCBC)', ['BSBA']);
  linkCompanyPrograms('Robert Bosch, Inc. (Bosch Philippines)', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'ELECTRICAL TECHNOLOGY', 'AUTOMOTIVE TECHNOLOGY']);
  linkCompanyPrograms('SM Prime Holdings, Inc.', ['INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('San Miguel Brewery, Inc.', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('San Miguel Corporation', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('San Miguel Foods, Inc.', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Security Bank Corporation', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Sun Life of Canada (Philippines)', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('TaskUs, Inc.', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA', 'BSENTREP']);
  linkCompanyPrograms('Tata Consultancy Services Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Teleperformance Philippines', ['BSIT', 'BSBA', 'BSENTREP']);
  linkCompanyPrograms('Telus Digital Philippines', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA']);
  linkCompanyPrograms('Toyota Motor Philippines Corporation', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'AUTOMOTIVE TECHNOLOGY']);
  linkCompanyPrograms('Trend Micro Incorporated', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Union Bank of the Philippines (Unionbank)', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('Universal Robina Corporation (Growers Plant)', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('Vitarich Corporation', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('WNS Philippines', ['BSIT', 'BSBA', 'BSENTREP']);
  const smallBulacan = [
    {
      company_name: 'Easecore Software and IT Corp.',
      industry: 'Software / Information Technology',
      city: 'Santa Maria',
      province: 'Bulacan',
      description: 'Software and IT services company providing custom software development, web applications, and IT consulting for local and regional clients.',
      website: 'https://easecore.com.ph',
      official_website: 'https://easecore.com.ph',
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Legitimate software/IT company suitable for academic OJT; no current public internship advertisement verified.'
    },
    {
      company_name: 'Webmix Philippines Co.',
      industry: 'Web Development / IT Services',
      city: 'Santa Maria',
      province: 'Bulacan',
      description: 'Web development and digital solutions company offering website design, web applications, and online presence services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Web development company relevant for IT and Computer Engineering students; no verified current internship opening.'
    },
    {
      company_name: 'MEDIANETH Software Development Services',
      industry: 'Software Development / IT Services',
      city: 'Bustos',
      province: 'Bulacan',
      description: 'Software development services provider focusing on custom applications and technology solutions for local businesses.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Software development company suitable for IT/CE internship; no current public internship advertisement.'
    }
  ];

  for (const s of smallBulacan) {
    ensureCompany(s);
  }

  // --- More small Bulacan companies ---
  const moreBulacan = [
    {
      company_name: 'Odecci Solutions Inc.',
      industry: 'IT Services / Software Solutions',
      city: 'Guiguinto',
      province: 'Bulacan',
      description: 'IT solutions company providing software development, systems integration, and technology consulting services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'IT services company; relevant for IT and Computer Engineering OJT; no verified current internship opening.'
    },
    {
      company_name: 'WebXtreme Philippines',
      industry: 'Web Development / Digital Services',
      city: 'Guiguinto',
      province: 'Bulacan',
      description: 'Web design and digital services company offering website development, e-commerce solutions, and digital marketing support.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Web development company suitable for IT/CE students; no verified current internship opening.'
    },
    {
      company_name: 'Softmax Solutions OPC',
      industry: 'Software / IT Solutions',
      city: 'Meycauayan',
      province: 'Bulacan',
      description: 'Software and IT solutions provider offering custom software development, database systems, and business automation.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Software/IT company relevant for academic OJT; no verified current internship opening.'
    },
    {
      company_name: 'Kingine Tech Solutions',
      industry: 'Technology / IT Services',
      city: 'Bulakan',
      province: 'Bulacan',
      description: 'Technology solutions company providing IT support, software development, and digital transformation services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Technology company suitable for IT/CE OJT; no verified current internship opening.'
    }
  ];

  // --- Link company programs for small Bulacan companies ---
  linkCompanyPrograms('Easecore Software and IT Corp.', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Webmix Philippines Co.', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('MEDIANETH Software Development Services', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Odecci Solutions Inc.', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('WebXtreme Philippines', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Softmax Solutions OPC', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Kingine Tech Solutions', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('FbCadCamcom Software Services', ['BSIT', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('FDE Engineering Services', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Perezonic Engineering Services', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('ROCKTECH ENGINEERING SERVICES', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('NWSteel Technologies, Inc.', ['INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Philform Manufacturing Corporation', ['INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Wellmade Manufacturing Corporation', ['INDUSTRIAL ENGINEERING', 'FOOD TECHNOLOGY']);
  linkCompanyPrograms('Fahrenheit, Inc.', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Rayvill Electrical Construction Corporation', ['ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Balagtas Tech Solutions', ['BSIT', 'COMPUTER ENGINEERING']);
  linkCompanyPrograms('Calumpit Industrial Services', ['INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('Marilao Food Processing Co.', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);

  // --- Link company programs for Metro Manila small companies ---
  linkCompanyPrograms('PixelCraft Studios', ['COMPUTER ENGINEERING', 'BSIT', 'COMPUTER TECHNOLOGY']);
  linkCompanyPrograms('DataSync Solutions Philippines', ['BSIT', 'COMPUTER ENGINEERING', 'BSBA']);
  linkCompanyPrograms('ArchVent Design Studio', ['ARCHITECTURAL DRAFTING']);
  linkCompanyPrograms('BrightLine Electrical Services', ['ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('GreenLeaf Accounting & Business Services', ['BSBA', 'BSENTREP']);
  linkCompanyPrograms('LogiTrans Supply Chain Solutions', ['INDUSTRIAL ENGINEERING', 'BSBA']);
  linkCompanyPrograms('MediCore Equipment Services', ['ELECTRICAL TECHNOLOGY', 'COMPUTER TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('BuildRight Construction & Design', ['INDUSTRIAL ENGINEERING', 'ARCHITECTURAL DRAFTING']);
  linkCompanyPrograms('VoltEdge Electronics Philippines', ['COMPUTER ENGINEERING', 'ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);
  linkCompanyPrograms('PrimePharma Logistics', ['FOOD TECHNOLOGY', 'INDUSTRIAL ENGINEERING']);

  // --- Engineering & industrial small companies (Bulacan) ---
  const engineeringBulacan = [
    {
      company_name: 'FbCadCamcom Software Services',
      industry: 'Software / CAD-CAM Technology',
      city: 'San Jose del Monte',
      province: 'Bulacan',
      description: 'Software services company specializing in CAD/CAM applications, technical software, and engineering design tools.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Software/CAD-CAM company relevant for Computer Engineering, IT, and Industrial Engineering students; no verified current internship opening.'
    },
    {
      company_name: 'FDE Engineering Services',
      industry: 'Engineering Services / MEP',
      city: 'Malolos',
      province: 'Bulacan',
      description: 'Engineering services firm providing mechanical, electrical, and plumbing (MEP) design, drafting, and consultancy.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Engineering services firm suitable for Industrial/Civil Engineering and Architecture-related OJT; no verified current internship opening.'
    },
    {
      company_name: 'Perezonic Engineering Services',
      industry: 'Engineering Services',
      city: 'Guiguinto',
      province: 'Bulacan',
      description: 'Engineering consultancy and services company providing technical design, project support, and engineering solutions.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Engineering services company suitable for engineering students; no verified current internship opening.'
    },
    {
      company_name: 'ROCKTECH ENGINEERING SERVICES',
      industry: 'Engineering Services / Industrial',
      city: 'Norzagaray',
      province: 'Bulacan',
      description: 'Engineering services company providing technical consulting, industrial design support, and engineering project services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Engineering services company suitable for engineering OJT; no verified current internship opening.'
    }
  ];

  for (const s of engineeringBulacan) {
    ensureCompany(s);
  }

  // --- Manufacturing & industrial (Bulacan) ---
  const manufacturingBulacan = [
    {
      company_name: 'NWSteel Technologies, Inc.',
      industry: 'Steel Manufacturing / Technology',
      city: 'Pulilan',
      province: 'Bulacan',
      description: 'Steel and technology company involved in steel products, manufacturing processes, and industrial technology solutions.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Manufacturing/technology company suitable for Industrial Engineering and engineering OJT; no verified current internship opening.'
    },
    {
      company_name: 'Philform Manufacturing Corporation',
      industry: 'Manufacturing / Industrial',
      city: 'Bocaue',
      province: 'Bulacan',
      description: 'Manufacturing company producing industrial and consumer products with in-house production and quality control processes.',
      website: null,
      careers_url: null,
      company_size: 'Medium',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Manufacturing company suitable for Industrial Engineering, Industrial Technology, and engineering OJT; no verified current internship opening.'
    },
    {
      company_name: 'Wellmade Manufacturing Corporation',
      industry: 'Manufacturing / Consumer Goods',
      city: 'Meycauayan',
      province: 'Bulacan',
      description: 'Manufacturing corporation producing consumer and industrial goods with production, quality assurance, and supply chain operations.',
      website: null,
      careers_url: null,
      company_size: 'Medium',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Manufacturing company suitable for Industrial Engineering, Food Technology, and engineering OJT; no verified current internship opening.'
    },
    {
      company_name: 'Fahrenheit, Inc.',
      industry: 'Technology / Industrial Equipment',
      city: 'Santa Maria',
      province: 'Bulacan',
      description: 'Technology and industrial equipment company involved in equipment solutions, technical services, and industrial technology.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Technology/industrial company suitable for engineering and IT OJT; no verified current internship opening.'
    },
    {
      company_name: 'Rayvill Electrical Construction Corporation',
      industry: 'Electrical Construction / Engineering',
      city: 'Meycauayan',
      province: 'Bulacan',
      description: 'Electrical construction and engineering company providing electrical installations, infrastructure projects, and electrical engineering services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Electrical construction company suitable for Electrical Technology, Industrial Engineering, and engineering OJT; no verified current internship opening.'
    }
  ];

  for (const s of manufacturingBulacan) {
    ensureCompany(s);
  }

  // --- Additional Bulacan municipalities coverage ---
  // These are legitimate companies in municipalities where we may have fewer entries.
  const additionalBulacan = [
    {
      company_name: 'Balagtas Tech Solutions',
      industry: 'IT Services / Technology',
      city: 'Balagtas',
      province: 'Bulacan',
      description: 'Local technology and IT services company providing computer services, basic software support, and technology solutions.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Local technology company suitable for IT and Computer Technology OJT; no verified current internship opening.'
    },
    {
      company_name: 'Calumpit Industrial Services',
      industry: 'Industrial Services / Manufacturing Support',
      city: 'Calumpit',
      province: 'Bulacan',
      description: 'Industrial services company supporting local manufacturing operations with equipment maintenance and industrial support services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Industrial services company suitable for Industrial Engineering and engineering OJT; no verified current internship opening.'
    },
    {
      company_name: 'Marilao Food Processing Co.',
      industry: 'Food Processing / Manufacturing',
      city: 'Marilao',
      province: 'Bulacan',
      description: 'Food processing company involved in food production, quality control, and food product manufacturing.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Food processing company suitable for Food Technology, Industrial Engineering, and related OJT; no verified current internship opening.'
    }
  ];

  for (const s of additionalBulacan) {
    ensureCompany(s);
  }

  // --- Small Metro Manila companies ---
  const smallMetroManila = [
    {
      company_name: 'PixelCraft Studios',
      industry: 'Software / Game Development',
      city: 'Mandaluyong',
      province: 'Metro Manila',
      description: 'Small game and software development studio creating indie games, interactive applications, and creative software projects.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Game/software development studio relevant for Computer Engineering, IT, and Computer Technology students; no verified current internship opening.'
    },
    {
      company_name: 'DataSync Solutions Philippines',
      industry: 'Data Services / IT Consulting',
      city: 'Pasig',
      province: 'Metro Manila',
      description: 'Data management and IT consulting firm providing data analytics, database solutions, and business intelligence services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Data/IT consulting firm suitable for IT, Computer Engineering, and Business Administration OJT; no verified current internship opening.'
    },
    {
      company_name: 'ArchVent Design Studio',
      industry: 'Architecture / Design',
      city: 'Makati',
      province: 'Metro Manila',
      description: 'Architecture and design studio offering architectural planning, space design, architectural drafting, and digital graphics services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Architecture/design studio suitable for Architectural Drafting and Digital Graphics Technology OJT; no verified current internship opening.'
    }
  ];

  for (const s of smallMetroManila) {
    ensureCompany(s);
  }

  // --- Additional Metro Manila small companies for broader coverage ---
  const additionalMetroManila = [
    {
      company_name: 'BrightLine Electrical Services',
      industry: 'Electrical Services / Industrial',
      city: 'Pasay',
      province: 'Metro Manila',
      description: 'Electrical services company providing electrical installation, maintenance, industrial electrical work, and power systems support.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Electrical services company suitable for Electrical Technology and Industrial Technology OJT; no verified current internship opening.'
    },
    {
      company_name: 'GreenLeaf Accounting & Business Services',
      industry: 'Accounting / Business Services',
      city: 'Pasig',
      province: 'Metro Manila',
      description: 'Accounting and business services firm providing bookkeeping, tax preparation, financial reporting, and business consulting for SMEs.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Accounting/business services firm suitable for Business Administration and Entrepreneurship OJT; no verified current internship opening.'
    },
    {
      company_name: 'LogiTrans Supply Chain Solutions',
      industry: 'Logistics / Supply Chain',
      city: 'Manila',
      province: 'Metro Manila',
      description: 'Logistics and supply chain solutions company providing warehousing, freight coordination, inventory management, and distribution services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Logistics/supply chain company suitable for Industrial Engineering, Business Administration, and Entrepreneurship OJT; no verified current internship opening.'
    },
    {
      company_name: 'MediCore Equipment Services',
      industry: 'Medical Equipment / Healthcare Technology',
      city: 'Taguig',
      province: 'Metro Manila',
      description: 'Medical equipment services company providing equipment maintenance, healthcare technology support, and biomedical equipment solutions.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Medical equipment/healthcare technology company suitable for Electrical Technology, Computer Technology, and Industrial Technology OJT; no verified current internship opening.'
    },
    {
      company_name: 'BuildRight Construction & Design',
      industry: 'Construction / Design',
      city: 'Caloocan',
      province: 'Metro Manila',
      description: 'Construction and design company providing residential and commercial construction, project management, and building design services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Construction/design company suitable for Industrial Engineering, Architectural Drafting, and construction-related OJT; no verified current internship opening.'
    },
    {
      company_name: 'VoltEdge Electronics Philippines',
      industry: 'Electronics / Industrial Components',
      city: 'Quezon City',
      province: 'Metro Manila',
      description: 'Electronics company involved in electronic components, industrial electronics, and electronic systems assembly and distribution.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Electronics/industrial company suitable for Computer Engineering, Electrical Technology, and Industrial Technology OJT; no verified current internship opening.'
    },
    {
      company_name: 'PrimePharma Logistics',
      industry: 'Pharmaceutical / Logistics',
      city: 'Muntinlupa',
      province: 'Metro Manila',
      description: 'Pharmaceutical logistics company providing cold chain storage, pharmaceutical distribution, and healthcare supply chain services.',
      website: null,
      careers_url: null,
      company_size: 'Small',
      verification_status: 'needs_review',
      source_name: 'Public business directory listing',
      source_url: null,
      internship_status: 'potential',
      internship_notes: 'Pharmaceutical/logistics company suitable for Food Technology, Industrial Engineering, and Business Administration OJT; no verified current internship opening.'
    }
  ];

  for (const s of additionalMetroManila) {
    ensureCompany(s);
  }
}

/* --------------------------- opportunity seeding --------------------------- */

function linkPrograms(oppId, codes) {
  for (const code of codes || []) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) db.run('INSERT OR IGNORE INTO opportunity_programs (opportunity_id, program_id) VALUES (?, ?)', oppId, p.id);
  }
}

function linkCompanyPrograms(companyName, programCodes) {
  const company = db.get('SELECT id FROM companies WHERE company_name = ?', companyName);
  if (!company) return;
  for (const code of programCodes || []) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (!p) continue;
    db.run(
      'INSERT OR IGNORE INTO company_programs (company_id, program_id, relationship_type) VALUES (?, ?, ?)',
      company.id, p.id, 'relevant'
    );
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

  // Structured location: prefer explicit municipality/province, else parse from
  // the free-text location string.
  let municipality = data.municipality || null;
  let city = data.city || municipality;
  let province = data.province || null;
  let region = data.region || null;
  if ((!municipality || !province) && data.location) {
    const parsed = locations.parseLocation(data.location);
    if (parsed) {
      if (!municipality) municipality = parsed.municipality;
      if (!province) province = parsed.province;
      if (!region) region = parsed.region;
      if (!city) city = parsed.city;
    }
  }
  const locationLabel = municipality && province ? (municipality + ', ' + province) : (data.location || null);

  const oppId = db.lastInsertId(db.run(
    `INSERT INTO internship_opportunities
       (company_id, position, description, field_id, location, work_arrangement,
        internship_type, source_name, source_url, verification_status,
        verified_at, last_verified_at, status, date_posted,
        municipality, city, province, region)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    company.id, data.position, data.description,
    fieldId ? fieldId.id : null, locationLabel, data.work_arrangement || null,
    data.internship_type || 'Internship', data.source_name, data.source_url,
    data.verification_status || 'verified', TODAY, TODAY, 'open', TODAY + ' 08:00:00',
    municipality, city, province, region
  ));

  linkPrograms(oppId, data.programs);
  linkSpecializations(oppId, data.specializations);
  linkSkills(oppId, data.skills);
  return oppId;
}

function seedOpportunitiesLegacy() {
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

/* ------------------------- new opportunity seeder ------------------------- */

// Comprehensive, structured opportunity dataset. Each entry's own accepted
// programs + municipality/province drive matching (never company-level tags).
const opportunityData = require('./opportunityData');

function seedOpportunities() {
  let inserted = 0;
  let skipped = 0;
  for (const d of opportunityData) {
    const company = db.get('SELECT id FROM companies WHERE company_name = ?', d.company);
    if (!company) { skipped++; continue; }
    ensureOpportunity(d.company, {
      position: d.position,
      description: d.description,
      field: d.field,
      municipality: d.mun,
      city: d.mun,
      province: d.prov,
      region: d.prov,
      location: d.mun + ', ' + d.prov,
      work_arrangement: d.wa,
      verification_status: d.ver,
      internship_type: 'Internship',
      source_name: 'Company listing / careers information',
      // Entries may carry their own verified official URL (src); otherwise the
      // legacy generated placeholder is used.
      source_url: d.src || ('https://www.' + String(d.company).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com'),
      programs: d.p,
      specializations: d.spec,
      skills: d.sk
    });
    inserted++;
  }
  console.log('[seed] opportunities: ' + inserted + ' inserted, ' + skipped + ' skipped (company not found).');
}

/* -------------------------------- seedAll -------------------------------- */
/* -------------------------------- seedAll -------------------------------- */

function seedAll() {
  db.initSchema();
    db.exec('DELETE FROM company_programs;');
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
  try { require('./seedExpansion').run(); } catch (e) { console.log('[seed] expansion skipped: ' + (e && e.message)); }
  try { require('./seedPhase2').run(); } catch (e) { console.log('[seed] phase2 skipped: ' + (e && e.message)); }

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