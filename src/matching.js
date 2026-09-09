'use strict';

/**
 * InternConnect — Smart Internship Matching
 * ----------------------------------------
 *
 * A fully local, transparent, weighted compatibility algorithm. No AI, no APIs,
 * no paid services — it runs on ordinary application logic and database data.
 *
 * It deliberately prioritizes REAL compatibility over simply matching the
 * student's course name. For example, a BE/CPE student with HTML/CSS/JS can be
 * recommended a "Web Development Intern" even when a company lists BSIT first,
 * because skills, interests and related-program knowledge carry weight.
 *
 * Weighting (adjustable here to keep scoring logical and explainable):
 *   Course compatibility            : 25%
 *   Specialization compatibility    : 15%
 *   Skills compatibility            : 30%
 *   Interest / internship field     : 15%
 *   Location compatibility          : 10%
 *   Work arrangement compatibility  :  5%
 *   -------------------------------------------------
 *   Total                           : 100%
 *
 * Modular by design: a future optional AI layer can be plugged in (richer
 * explanations, description analysis) WITHOUT being required for matching.
 */

const WEIGHTS = {
  course: 0.25,
  specialization: 0.15,
  skills: 0.30,
  field: 0.15,
  location: 0.10,
  arrangement: 0.05
};

/**
 * Programs considered "related" for matching purposes. This enables skill-based
 * cross-program discovery while keeping scores explainable.
 */
const RELATED_PROGRAMS = {
  BSIT: ['COMPUTER ENGINEERING', 'BINDTECH', 'BSBA'],
  'COMPUTER ENGINEERING': ['BSIT', 'INDUSTRIAL ENGINEERING', 'BINDTECH'],
  BSBA: ['BSENTREP', 'BSIT'],
  BSENTREP: ['BSBA'],
  'INDUSTRIAL ENGINEERING': ['BSBA', 'COMPUTER ENGINEERING'],
  BINDTECH: ['BSIT', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING']
};

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function ciEqual(a, b) {
  return norm(a) === norm(b) && norm(a) !== '';
}

/**
 * Course compatibility (0..1):
 *   1.0 = student's program is explicitly listed as preferred
 *   0.5 = related/acceptable program (or open to all programs)
 *   0.0 = clearly incompatible program
 */
function courseScore(studentProgram, oppPrograms) {
  const list = (oppPrograms || []).map(norm).filter(Boolean);
  const sp = norm(studentProgram);
  if (!sp) return 0.5; // no program on profile — neutral
  if (list.length === 0) return 0.5; // open to all programs — neutral
  if (list.includes(sp)) return 1.0;
  const related = (RELATED_PROGRAMS[studentProgram] || []).map(norm);
  if (related.some((r) => list.includes(r))) return 0.5;
  return 0.0;
}
/**
 * Specialization compatibility (0..1):
 *   1.0 = exact specialization match
 *   0.5 = related specialization (student's program is listed but not this spec)
 *   0.0 = no/incompatible specialization information
 */
function specializationScore(studentSpec, oppSpecs, oppPrograms) {
  const specs = (oppSpecs || []).map(norm).filter(Boolean);
  if (specs.length === 0) return 0.5; // no specialization requirement — neutral
  const ss = norm(studentSpec);
  if (!ss) return 0.0;
  if (specs.includes(ss)) return 1.0;
  // Student's specialization isn't required, but their program is listed -> related
  if ((oppPrograms || []).length > 0) return 0.5;
  return 0.0;
}

/**
 * Skills compatibility (0..1) — the heaviest criterion (30%).
 * Uses coverage: how much of the opportunity's required skills the student has.
 * Recognizes closely-related skill aliases (Photoshop/Canva, AutoCAD/SketchUp).
 */
const SKILL_ALIASES = [
  ['photoshop', 'canva', 'graphic design', 'adobe'],
  ['autocad', 'drafting', 'sketchup', 'cad'],
  ['javascript', 'typescript', 'es6', 'web'],
  ['wordpress', 'web design', 'html', 'css']
];

function skillsScore(studentSkills, requiredSkills) {
  const req = (requiredSkills || []).map(norm).filter(Boolean);
  if (req.length === 0) return 0.5; // no required skills specified — neutral
  if (!studentSkills || studentSkills.length === 0) return 0;
  const have = studentSkills.map(norm).filter(Boolean);
  function hasSkill(required) {
    if (have.includes(required)) return true;
    for (const group of SKILL_ALIASES) {
      if (group.includes(required) && have.some((h) => group.includes(h))) return true;
    }
    if (have.some((h) => h.includes(required) || required.includes(h))) return true;
    return false;
  }
  // Skills score = percentage of required skills the student actually has.
  const matched = req.filter((r) => hasSkill(r)).length;
  return matched / req.length;
}

/* Nearby-location map (Bulacan priority + Metro Manila). Values are substrings
   matched against an opportunity's location string. */
const NEARBY_LOCATIONS = {
  'bulacan': [
    'metro manila', 'manila', 'quezon city', 'pampanga', 'nueva ecija', 'tarlac',
    'valenzuela', 'caloocan', 'malabon', 'navotas', 'central luzon',
    'malolos', 'bocaue', 'guiguinto', 'plaridel', 'baliwag', 'calumpit'
  ],
  'marilao': ['bulacan', 'metro manila', 'valenzuela', 'meycauayan', 'bocaue', 'san jose del monte', 'central luzon'],
  'meycauayan': ['bulacan', 'valenzuela', 'marilao', 'bocaue', 'caloocan', 'metro manila'],
  'san jose del monte': ['bulacan', 'quezon city', 'caloocan', 'metro manila', 'marilao'],
  'malolos': ['bulacan', 'central luzon', 'guiguinto', 'plaridel', 'baliwag', 'pampanga'],
  'bocaue': ['bulacan', 'marilao', 'meycauayan', 'metro manila'],
  'guiguinto': ['bulacan', 'malolos', 'baliwag', 'plaridel', 'central luzon'],
  'plaridel': ['bulacan', 'baliwag', 'guiguinto', 'malolos', 'calumpit'],
  'baliwag': ['bulacan', 'plaridel', 'guiguinto', 'malolos', 'calumpit'],
  'pulilan': ['bulacan', 'baliwag', 'calumpit', 'plaridel'],
  'calumpit': ['bulacan', 'baliwag', 'pulilan', 'plaridel', 'pampanga'],
  'santa maria': ['bulacan', 'balagtas', 'norzagaray', 'central luzon'],
  'balagtas': ['bulacan', 'santa maria', 'norzagaray'],
  'san ildefonso': ['bulacan', 'central luzon'],
  'obando': ['bulacan', 'central luzon'],
  'bulakan': ['bulacan', 'marilao', 'meycauayan', 'obando'],
  'norzagaray': ['bulacan', 'santa maria', 'balagtas', 'central luzon'],
  'cabang': ['bulacan', 'san ildefonso', 'central luzon'],
  'metro manila': [
    'bulacan', 'manila', 'quezon city', 'makati', 'taguig', 'pasig',
    'mandaluyong', 'valenzuela', 'caloocan', 'pasay', 'parañaque',
    'muntinlupa', 'marikina', 'las pinas', 'navotas', 'malabon',
    'san juan', 'pateros', 'central luzon'
  ],
  'pampanga': ['bulacan', 'tarlac', 'nueva ecija', 'bataan', 'central luzon', 'angeles'],
  'manila': ['metro manila', 'quezon city', 'makati', 'pasay', 'taguig'],
  'quezon city': ['metro manila', 'manila', 'makati', 'taguig', 'pasig', 'caloocan', 'san jose del monte', 'bulacan'],
  'makati': ['metro manila', 'manila', 'taguig', 'pasay', 'quezon city', 'pasig', 'mandaluyong'],
  'taguig': ['metro manila', 'makati', 'pasay', 'quezon city', 'manila', 'pasig'],
  'pasig': ['metro manila', 'mandaluyong', 'makati', 'quezon city', 'taguig'],
  'mandaluyong': ['metro manila', 'pasig', 'makati', 'quezon city'],
  'pasay': ['metro manila', 'manila', 'makati', 'taguig', 'parañaque'],
  'parañaque': ['metro manila', 'pasay', 'taguig', 'manila'],
  'muntinlupa': ['metro manila', 'taguig', 'manila'],
  'caloocan': ['metro manila', 'bulacan', 'valenzuela', 'malabon', 'manila'],
  'marikina': ['metro manila', 'pasig', 'mandaluyong', 'quezon city'],
  'las pinas': ['metro manila', 'manila', 'navotas'],
  'valenzuela': ['metro manila', 'bulacan', 'meycauayan', 'marilao', 'caloocan', 'bocaue'],
  'navotas': ['metro manila', 'manila', 'malabon', 'las pinas'],
  'malabon': ['metro manila', 'manila', 'caloocan', 'navotas', 'valenzuela'],
  'san juan': ['metro manila', 'manila'],
  'pateros': ['metro manila', 'valenzuela', 'manila', 'malabon']
};

function tokens(s) {
  return norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 3);
}

/**
 * Interest / internship field compatibility (0..1):
 *   1.0  = exact field match
 *   0.75 = closely related (shares a meaningful keyword)
 *   0.5  = somewhat related (one side mentions the other)
 *   0.0  = unrelated / no interest data
 */
function fieldScore(oppField, studentInterests, preferredField) {
  const field = norm(oppField);
  if (!field) return 0.5; // no field specified — neutral
  const interests = (studentInterests || []).map(norm).filter(Boolean);
  const all = [...interests];
  if (preferredField) all.push(norm(preferredField));
  if (!all.length) return 0.0;
  if (ciEqual(preferredField, oppField) || interests.includes(field)) return 1.0;
  const fTokens = tokens(field);
  for (const i of all) {
    const iTok = tokens(i);
    if (fTokens.some((t) => iTok.includes(t) || iTok.some((x) => t.includes(x) && x.length > 3))) {
      return 0.75;
    }
  }
  return 0.0;
}

/**
 * Location compatibility (0..1):
 *   1.0  = preferred location matches the opportunity location
 *   0.75 = nearby/acceptable (see NEARBY_LOCATIONS)
 *   0.5  = remote/hybrid compatibility where applicable, or unknown
 *   0.0  = incompatible
 */
function locationScore(oppLocation, preferredLocation, oppArrangement) {
  const o = norm(oppLocation);
  const p = norm(preferredLocation);
  if (!o || !p) return 0.5; // unknown — neutral
  if (o === p || o.includes(p) || p.includes(o)) return 1.0;
  const near = NEARBY_LOCATIONS[p] || [];
  if (near.some((n) => o.includes(n))) return 0.75;
  const arr = norm(oppArrangement);
  if (arr === 'remote' || arr === 'hybrid') return 0.5;
  return 0.0;
}

/**
 * Work arrangement compatibility (0..1):
 *   1.0 = exact match
 *   0.5 = acceptable alternative (hybrid bridges on-site and remote)
 *   0.0 = incompatible
 */
function arrangementScore(oppArrangement, preferredArrangement) {
  if (!oppArrangement || !preferredArrangement) return 0.5; // unknown — neutral
  if (ciEqual(oppArrangement, preferredArrangement)) return 1.0;
  const o = norm(oppArrangement).replace(/[^a-z]/g, '');
  const p = norm(preferredArrangement).replace(/[^a-z]/g, '');
  if (o === p) return 1.0;
  if (o === 'hybrid' || p === 'hybrid') return 0.5;
  return 0.0;
}
/* ------------------------- reasoning helpers ------------------------- */

function courseReason(studentProgram, oppPrograms) {
  if ((oppPrograms || []).length === 0) return 'Open to all programs';
  const list = oppPrograms.map(String);
  if (list.some((p) => ciEqual(p, studentProgram))) return 'Course matches';
  const sp = String(studentProgram || '');
  const related = (RELATED_PROGRAMS[sp] || []);
  if (related.some((r) => list.some((p) => ciEqual(p, r)))) {
    return `Related program accepted (${sp})`;
  }
  return 'Partial course match';
}

function skillsReason(requiredSkills, matchedSkills) {
  if (!requiredSkills || requiredSkills.length === 0) return 'No required skills specified';
  if (matchedSkills && matchedSkills.length) {
    const shown = matchedSkills.slice(0, 4).map(String);
    return `Skills match: ${shown.join(', ')}${matchedSkills.length > 4 ? '…' : ''}`;
  }
  return 'Partial skills overlap';
}

/**
 * Build the compatibility breakdown between a student profile and one
 * opportunity. Returns a normalized score plus an explainable breakdown.
 */
function computeMatch(student, opportunity) {
  const oppPrograms = opportunity.programs || [];
  const oppSpecs = opportunity.specializations || [];
  const reqSkills = opportunity.skills || [];

  const sc = courseScore(student.program, oppPrograms);
  const ss = specializationScore(student.specialization, oppSpecs, oppPrograms);
  const sk = skillsScore(student.skills, reqSkills);
  const f  = fieldScore(opportunity.field, student.interests, student.preferred_field);
  const lc = locationScore(opportunity.location, student.preferred_location, opportunity.work_arrangement);
  const ar = arrangementScore(opportunity.work_arrangement, student.work_arrangement);

  const total = (sc * WEIGHTS.course) +
                (ss * WEIGHTS.specialization) +
                (sk * WEIGHTS.skills) +
                (f  * WEIGHTS.field) +
                (lc * WEIGHTS.location) +
                (ar * WEIGHTS.arrangement);

  // Round only the final displayed value (profile-to-opportunity compatibility,
  // NOT a prediction of hiring or acceptance).
  const score = Math.round(total * 100);
  const clamped = Math.max(0, Math.min(100, score));

  // Explanations: ✓ = strong match, △ = partial match, ✕ = weak/no match
  const checks = [];
  if (sc === 1.0) checks.push({ label: 'Your program matches the preferred program', ok: true });
  else if (sc === 0.5) checks.push({ label: courseReason(student.program, oppPrograms), ok: null });
  else checks.push({ label: 'Program: not the preferred course for this opening', ok: false });

  if (ss === 1.0) checks.push({ label: 'Exact specialization match', ok: true });
  else if (ss === 0.5) checks.push({ label: 'Related specialization compatibility', ok: null });
  else checks.push({ label: 'Specialization not specified or incompatible', ok: false });

  const matchedSkills = (reqSkills || []).filter((r) =>
    (student.skills || []).some((s) => ciEqual(s, r)));

  if (reqSkills.length === 0) checks.push({ label: 'No required skills specified', ok: null });
  else if (sk >= 0.75) checks.push({ label: `Your skills match ${Math.round(sk * 100)}% of the required skills`, ok: true });
  else if (sk > 0) checks.push({ label: `Your skills match ${Math.round(sk * 100)}% of the required skills`, ok: null });
  else checks.push({ label: 'None of the required skills are on your profile yet', ok: false });

  if (f === 1.0) checks.push({ label: 'Your internship field matches', ok: true });
  else if (f === 0.75) checks.push({ label: 'Closely related internship field', ok: null });
  else if (f === 0.5) checks.push({ label: 'Somewhat related internship field', ok: null });
  else checks.push({ label: 'Internship field differs from your interests', ok: false });

  if (lc === 1.0) checks.push({ label: 'Your preferred location matches', ok: true });
  else if (lc === 0.75) checks.push({ label: 'Location is nearby your preferred area', ok: null });
  else if (lc === 0.5) checks.push({ label: 'Remote/hybrid setup makes location flexible', ok: null });
  else checks.push({ label: 'Location differs from your preference', ok: false });

  if (ar === 1.0) checks.push({ label: 'Work arrangement matches your preference', ok: true });
  else if (ar === 0.5) checks.push({ label: 'Acceptable alternative work arrangement', ok: null });
  else checks.push({ label: 'Work arrangement differs from your preference', ok: false });

  // Human-friendly headline reason
  const parts = [];
  if (sc >= 0.9) parts.push(`${student.program || 'your program'} program`);
  if (f >= 0.9 && opportunity.field) parts.push(`${opportunity.field} interest`);
  if (sk >= 0.6) parts.push(`${matchedSkills.length ? matchedSkills.slice(0, 3).join(', ') + ' skills' : 'strong skills'}`);
  if (lc >= 0.9 && opportunity.location) parts.push(`${opportunity.location} location`);
  if (ar >= 0.9 && opportunity.workArrangement) parts.push(`${opportunity.workArrangement.toLowerCase()} preference`);

  let reason;
  if (parts.length >= 2) {
    reason = 'Strong profile compatibility based on your ' +
      (parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]) + '.';
  } else if (parts.length === 1) {
    reason = `Moderate profile compatibility aligned with your ${parts[0]}.`;
  } else {
    reason = 'Based on your profile and the opportunity requirements.';
  }

  return {
    score: clamped,
    breakdown: { course: sc, specialization: ss, skills: sk, field: f, location: lc, arrangement: ar },
    weights: WEIGHTS,
    matchedSkills,
    checks,
    reason,
    note: 'This score is your profile-to-opportunity compatibility. It is not a prediction of acceptance or hiring.'
  };
}

module.exports = {
  computeMatch,
  WEIGHTS,
  courseScore,
  skillsScore,
  fieldScore,
  locationScore,
  RELATED_PROGRAMS
};