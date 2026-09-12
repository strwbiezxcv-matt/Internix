'use strict';

/**
 * Internix - Program + Location Based Internship Matching
 * Weighting (per Internix spec):
 *   Program compatibility : 50% | Location : 25% | Role : 15% | Skills : 10%
 * Program compatibility comes ONLY from the opportunity's own
 * opportunity_programs list. Company industry never creates a strong match.
 */

const programMap = require('./programMap');
const locations = require('./locations');

const WEIGHTS = { program: 0.50, location: 0.25, role: 0.15, skills: 0.10 };

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function clamp(pct) {
  return Math.max(0, Math.min(100, Math.round(pct)));
}

function roleScore(selectedCodes, oppField) {
  const codes = (selectedCodes || []).filter(Boolean);
  if (!codes.length) return 0.5;
  const f = norm(oppField);
  if (!f) return 0.3;
  let best = 0.2;
  for (const c of codes) {
    for (const field of programMap.fieldsFor(c)) {
      const nf = norm(field);
      if (f === nf) return 1.0;
      if (f.includes(nf) || nf.includes(f)) best = Math.max(best, 0.7);
    }
  }
  return best;
}

function skillsScore(selectedCodes, oppSkills) {
  const codes = (selectedCodes || []).filter(Boolean);
  if (!codes.length) return 0.5;
  const set = new Set();
  codes.forEach((c) => programMap.skillsFor(c).forEach((s) => set.add(norm(s))));
  const opp = (oppSkills || []).map(norm).filter(Boolean);
  if (!opp.length) return 0.4;
  const shared = opp.filter((s) => set.has(s)).length;
  const ratio = shared / opp.length;
  return shared === 0 ? 0.2 : Math.min(1, 0.35 + 0.65 * ratio);
}

/**
 * Compute the profile-to-opportunity compatibility score.
 * profile: { programs:[codes], location: selection-or-null }
 * opp: loaded opportunity with programs, field, skills, _loc (parsed location).
 */
function computeMatch(profile, opp) {
  profile = profile || {};
  opp = opp || {};
  const selected = profile.programs || [];
  const oppPrograms = opp.programs || [];

  const prog = programMap.programMatch(selected, oppPrograms);
  const lc = locations.locationScore(profile.location, opp._loc);
  const role = roleScore(selected, opp.field);
  const skills = skillsScore(selected, opp.skills);

  const raw = prog.score * WEIGHTS.program + lc * WEIGHTS.location +
              role * WEIGHTS.role + skills * WEIGHTS.skills;
  const scored = clamp(raw * 100);

  const explanation = buildExplanation(profile, opp, prog, lc, role, skills);

  return {
    score: scored,
    program: { score: prog.score, tier: prog.tier, matches: prog.matches },
    location: lc,
    role: role,
    skills: skills,
    weights: WEIGHTS,
    explanation: explanation,
    breakdown: {
      program: Math.round(prog.score * WEIGHTS.program * 100),
      location: Math.round(lc * WEIGHTS.location * 100),
      role: Math.round(role * WEIGHTS.role * 100),
      skills: Math.round(skills * WEIGHTS.skills * 100)
    }
  };
}
function buildExplanation(profile, opp, prog, lc, role, skills) {
  const selNames = (profile.programs || []).map((c) => programMap.displayName(c));
  const oppLoc = opp._loc;
  const locName = oppLoc && oppLoc.label ? oppLoc.label : (opp.location || 'unlisted location');

  let kind;
  let programPart;
  if (prog.tier === 'exact') {
    const matched = (prog.matches || []).map((c) => programMap.displayName(c));
    kind = 'Strong match';
    programPart = 'this opportunity explicitly accepts ' +
      (matched.length > 1 ? 'multiple of your selected programs' : (matched[0] || 'your program')) + '.';
  } else if (prog.tier === 'related') {
    kind = 'Related opportunity';
    programPart = 'your program is closely related to one of this opportunity\u2019s accepted programs.';
  } else if (prog.tier === 'open') {
    kind = 'Open opportunity';
    programPart = 'this opportunity is open to all programs.';
  } else if (prog.tier === 'none') {
    kind = 'All programs';
    programPart = 'no program was selected.';
  } else {
    kind = 'Potential mismatch';
    programPart = 'this opportunity does not list your program.';
  }

  const locationBits = [];
  const sel = profile.location;
  if (sel) {
    if (sel.municipality) {
      if (oppLoc && oppLoc.municipality && String(oppLoc.municipality).toLowerCase() === String(sel.municipality).toLowerCase()) {
        locationBits.push('located exactly in ' + sel.municipality);
      } else if (oppLoc && oppLoc.province && sel.province && String(oppLoc.province).toLowerCase() === String(sel.province).toLowerCase()) {
        locationBits.push('located in ' + (oppLoc.label || oppLoc.province) + ' within your preferred province');
      } else {
        locationBits.push('located outside your preferred area (' + locName + ')');
      }
    } else if (sel.province) {
      if (oppLoc && oppLoc.province && String(oppLoc.province).toLowerCase() === String(sel.province).toLowerCase()) {
        locationBits.push('located in ' + (oppLoc.label || oppLoc.province));
      } else {
        locationBits.push('located in ' + (oppLoc.label || oppLoc.province || 'another area'));
      }
    }
  }

  const skillBit = skills >= 0.65
    ? ' It also calls for skills you would develop in ' + (selNames.length ? selNames[0] : 'your program') + '.'
    : '';

  const text = kind + ' because ' + programPart +
    (locationBits.length ? ' It is ' + locationBits.join(', ') + '.' : '') +
    ' The role aligns well with ' + (selNames.length ? selNames.join(' and ') : 'your program') + '.' +
    skillBit;

  return text;
}

module.exports = {
  computeMatch,
  WEIGHTS,
  programMatch: programMap.programMatch,
  roleScore,
  skillsScore
};