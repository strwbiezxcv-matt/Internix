'use strict';

/**
 * Internix - academic program map.
 *
 * Describes the relevant internship fields and typical skills for each
 * supported program. These drive the OPPORTUNITY-ROLE relevance (15%) and
 * SKILLS compatibility (10%) factors in the match score. They NEVER override
 * an explicit program mismatch - program compatibility is determined entirely
 * by the opportunity's own accepted-program list (opportunity_programs).
 */

const NORM = (s) => String(s || '').trim().toLowerCase();

// Full display names keyed by internal program code.
const DISPLAY = {
  BSBA: 'Business Administration',
  BSENTREP: 'Entrepreneurship',
  'COMPUTER ENGINEERING': 'Computer Engineering',
  'INDUSTRIAL ENGINEERING': 'Industrial Engineering',
  BSIT: 'Information Technology',
  'COMPUTER TECHNOLOGY': 'Computer Technology',
  'ARCHITECTURAL DRAFTING': 'Architectural Drafting and Digital Graphics Technology',
  'AUTOMOTIVE TECHNOLOGY': 'Automotive Technology',
  'FOOD TECHNOLOGY': 'Food Technology',
  'ELECTRICAL TECHNOLOGY': 'Electrical Technology'
};

// Internal codes that are selectable in the UI (full names shown to users).
const SELECTABLE = Object.keys(DISPLAY);

// Relevant internship FIELDS (role categories) per program.
const FIELDS = {
  BSBA: ['Administration', 'Human Resources', 'Marketing', 'Sales', 'Operations',
         'Accounting', 'Business Development', 'Office Administration', 'Business Management',
         'Finance', 'Customer Service'],
  BSENTREP: ['Business Development', 'Marketing', 'Sales', 'E-Commerce', 'Product Innovation',
             'Operations', 'Administration', 'Accounting', 'Business Management'],
  'COMPUTER ENGINEERING': ['Embedded Systems', 'Hardware', 'Electronics', 'Firmware', 'Automation',
                           'IoT', 'Software Development', 'Computer Systems', 'Network Systems',
                           'Electrical Systems', 'Robotics'],
  'INDUSTRIAL ENGINEERING': ['Manufacturing', 'Process Improvement', 'Quality Management', 'Supply Chain',
                             'Operations', 'Production', 'Food Production', 'Food Processing',
                             'Electrical Systems', 'Logistics'],
  BSIT: ['Web Development', 'Software Development', 'IT Support', 'Systems Administration', 'Database',
         'Network Administration', 'Cybersecurity', 'Technical Support', 'QA / Software Testing',
         'Data Analysis', 'Computer Systems'],
  'COMPUTER TECHNOLOGY': ['Computer Systems', 'Hardware', 'IT Support', 'Networking', 'Software Development',
                          'Electronics', 'Database', 'Technical Support', 'Web Development'],
  'ARCHITECTURAL DRAFTING': ['Architectural Drafting', 'CAD/Drafting', 'Digital Graphics', 'Design',
                             'Construction', 'Architecture', 'CAD/CAM'],
  'AUTOMOTIVE TECHNOLOGY': ['Automotive Service', 'Engine Systems', 'Diagnostics', 'Maintenance',
                            'Electrical Systems', 'Automation', 'Manufacturing', 'Quality Control'],
  'FOOD TECHNOLOGY': ['Food Production', 'Food Processing', 'Quality Control', 'Food Safety Standards',
                      'Manufacturing', 'Supply Chain', 'Quality Management'],
  'ELECTRICAL TECHNOLOGY': ['Electrical Systems', 'Wiring', 'Installation', 'Automation', 'Power Systems',
                            'Electronics', 'Maintenance', 'Quality Control']
};
// Typical SKILLS per program (used only as a secondary supporting factor).
const SKILLS = {
  BSBA: ['Communication', 'Excel', 'Project Management', 'Data Analysis', 'Customer Service',
         'Teamwork', 'Marketing', 'Office Administration'],
  BSENTREP: ['Communication', 'Marketing', 'Excel', 'Customer Service', 'Project Management',
             'Sales', 'Business Development'],
  'COMPUTER ENGINEERING': ['C/C++', 'Embedded C', 'Microcontrollers', 'Python', 'Networking',
                           'Troubleshooting', 'Wiring', 'Linux', 'Electronics'],
  'INDUSTRIAL ENGINEERING': ['Quality Control', 'Excel', 'Data Analysis', 'Project Management',
                             'Lean Manufacturing', 'AutoCAD', 'Process Improvement'],
  BSIT: ['HTML', 'CSS', 'JavaScript', 'Python', 'SQL', 'Git', 'Networking', 'Linux', 'Troubleshooting'],
  'COMPUTER TECHNOLOGY': ['Hardware', 'Networking', 'Troubleshooting', 'Windows', 'Linux',
                          'Python', 'SQL', 'IT Support'],
  'ARCHITECTURAL DRAFTING': ['AutoCAD', 'CAD/Drafting', 'SolidWorks', 'Design', 'CAD/CAM', 'Drafting'],
  'AUTOMOTIVE TECHNOLOGY': ['Diagnostics', 'Troubleshooting', 'Wiring', 'Maintenance',
                            'Automotive Service', 'Quality Control'],
  'FOOD TECHNOLOGY': ['Food Safety Standards', 'Quality Control', 'Lean Manufacturing', 'Data Analysis', 'Excel'],
  'ELECTRICAL TECHNOLOGY': ['Wiring', 'PLC Programming', 'Troubleshooting', 'Electrical', 'AutoCAD', 'Automation']
};

// Explicit cross-program relatedness used for the "closely related program"
// second tier. Keyed by internal code.
const RELATED = {
  BSBA: ['BSENTREP'],
  BSENTREP: ['BSBA'],
  'COMPUTER ENGINEERING': ['BSIT', 'COMPUTER TECHNOLOGY', 'ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING'],
  'INDUSTRIAL ENGINEERING': ['FOOD TECHNOLOGY', 'AUTOMOTIVE TECHNOLOGY', 'ELECTRICAL TECHNOLOGY', 'COMPUTER ENGINEERING'],
  BSIT: ['COMPUTER ENGINEERING', 'COMPUTER TECHNOLOGY'],
  'COMPUTER TECHNOLOGY': ['BSIT', 'COMPUTER ENGINEERING'],
  'ARCHITECTURAL DRAFTING': ['INDUSTRIAL ENGINEERING'],
  'AUTOMOTIVE TECHNOLOGY': ['ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING'],
  'FOOD TECHNOLOGY': ['INDUSTRIAL ENGINEERING'],
  'ELECTRICAL TECHNOLOGY': ['COMPUTER ENGINEERING', 'AUTOMOTIVE TECHNOLOGY', 'INDUSTRIAL ENGINEERING']
};

const DISPLAY_LOWER = Object.create(null);
for (const k in DISPLAY) DISPLAY_LOWER[String(k).toLowerCase()] = DISPLAY[k];

function displayName(code) {
  if (!code) return code;
  const v = DISPLAY[code];
  if (v) return v;
  return DISPLAY_LOWER[String(code).toLowerCase()] || code;
}

function fieldsFor(code) {
  return FIELDS[code] || [];
}

function skillsFor(code) {
  return SKILLS[code] || [];
}

function relatedFor(code) {
  return RELATED[code] || [];
}

/**
 * Program-to-opportunity compatibility based purely on the opportunity's own
 * accepted-program list. Returns one of:
 *   1.0 => the opportunity explicitly accepts one of the selected programs
 *   0.7 => the opportunity accepts a closely related program (not the exact one)
 *   0.5 => open to all programs (no restricted list)
 *   0   => the opportunity explicitly lists programs and none match (mismatch)
 * Also returns which selected/related program produced the score.
 */
function programMatch(selectedCodes, oppPrograms) {
  const opp = (oppPrograms || []).map(NORM).filter(Boolean);
  const sel = (selectedCodes || []).filter(Boolean);

  if (!sel.length) return { score: 0.5, tier: 'none', matches: [] };

  // 1) Exact match against any selected program.
  const exact = sel.filter((c) => opp.includes(NORM(c)));
  if (exact.length) return { score: 1.0, tier: 'exact', matches: exact.map(NORM) };

  // 2) Open to all programs (empty accepted list).
  if (opp.length === 0) return { score: 0.5, tier: 'open', matches: [] };

  // 3) Closely related program match.
  const relatedMatches = [];
  for (const sc of sel) {
    const rels = relatedFor(sc).map(NORM);
    const hit = rels.filter((r) => opp.includes(r));
    hit.forEach((r) => relatedMatches.push({ selected: NORM(sc), related: r }));
  }
  if (relatedMatches.length) return { score: 0.7, tier: 'related', matches: relatedMatches };

  // 4) Explicit mismatch - the opportunity lists programs but none are selected
  //    nor closely related. This should effectively exclude the opportunity.
  return { score: 0, tier: 'mismatch', matches: [] };
}

module.exports = {
  DISPLAY,
  SELECTABLE,
  FIELDS,
  SKILLS,
  RELATED,
  displayName,
  fieldsFor,
  skillsFor,
  relatedFor,
  programMatch,
  NORM
};