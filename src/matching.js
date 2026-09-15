'use strict';

/**
 * Internix - Program + Location Based Internship Matching
 * Weighting (per Internix spec):
 *   Program compatibility : 50% | Location : 25% | Role : 15% | Skills : 10%
 * Program compatibility comes ONLY from the opportunity's own
 * opportunity_programs list. Company industry never creates a strong match.
 *
 * CENTRALIZED MATCHER: every section of the app (Find My Matches,
 * Internship Opportunities, Companies, Featured) must rank through
 * computeMatch / matchOpportunity in this file so results stay consistent.
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

/* Accept both the new { programs:[...] } shape and the legacy { program }
   shape so older clients keep working while multi-select rolls out. */
function normalizeSelected(profile) {
  const p = profile || {};
  if (Array.isArray(p.programs) && p.programs.length) return p.programs.filter(Boolean);
  if (p.program) return [p.program].filter(Boolean);
  return [];
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
 * Shared eligibility gate used by every section.
 * A record is eligible only when:
 *   - its province strictly equals the selected province (Bulacan and
 *     Metro Manila are NEVER mixed), and
 *   - its accepted-program list matches at least one selected program
 *     (exact > related > open-to-all; explicit mismatches are excluded).
 * Returns { eligible, prog, provinceOk }.
 */
function eligibility(selectedPrograms, oppPrograms, profileLocation, oppLoc) {
  const prog = programMap.programMatch(selectedPrograms || [], oppPrograms || []);
  let provinceOk = true;
  const sel = profileLocation || null;
  if (sel && sel.province) {
    const op = oppLoc ? oppLoc.province : null;
    provinceOk = !!(op && norm(op) === norm(sel.province));
  }
  const eligible = provinceOk && prog.tier !== 'mismatch';
  return { eligible: eligible, prog: prog, provinceOk: provinceOk };
}

/**
 * Rank a list of loaded opportunities for a profile with the single
 * centralized scorer. Returns [{ opportunity, match }] sorted by score.
 */
function filterAndRank(opps, profile) {
  const p = profile || {};
  const selected = p.programs || (p.program ? [p.program] : []);
  const out = [];
  for (const o of (opps || [])) {
    if (!o || o.is_expired) continue;
    const gate = eligibility(selected, o.programs || [], p.location || null, o._loc);
    if (!gate.eligible) continue;
    out.push({ opportunity: o, match: computeMatch({ programs: selected, location: p.location || null }, o) });
  }
  out.sort((a, b) => (b.match.score - a.match.score) ||
    String(a.opportunity.company_name || '').localeCompare(String(b.opportunity.company_name || '')));
  return out;
}

/* Group ranked matches by company so the same company never repeats as a
   bare duplicate row: each company appears once with its openings listed
   underneath (the best opening sets the headline score). */
function dedupeByCompany(ranked) {
  const groups = [];
  const byId = new Map();
  for (const r of (ranked || [])) {
    const cid = r && r.opportunity ? r.opportunity.company_id : null;
    if (cid === null || cid === undefined || !byId.has(cid)) {
      const g = { company_id: cid, best: r, openings: [r] };
      byId.set(cid, g);
      groups.push(g);
    } else { byId.get(cid).openings.push(r); }
  }
  groups.sort((a, b) => (b.best.match.score - a.best.match.score) ||
    String(a.best.opportunity.company_name || '').localeCompare(String(b.best.opportunity.company_name || '')));
  return groups;
}

/* Company-level program gate: a company is listed under selected programs
   only when its own relevant_program_codes contain one (or a related one). */
function companyMatchesPrograms(company, selectedPrograms) {
  const sel = (selectedPrograms || []).filter(Boolean);
  if (!sel.length) return { ok: true, tier: 'none' };
  const codes = (company && company.relevant_program_codes) || [];
  if (codes.some((c) => sel.includes(c))) return { ok: true, tier: 'exact' };
  const relHit = sel.some((sc) => programMap.relatedFor(sc).some((r) => codes.includes(r)));
  if (relHit) return { ok: true, tier: 'related' };
  if (!codes.length) return { ok: true, tier: 'open' };
  return { ok: false, tier: 'mismatch' };
}


function computeMatch(profile, opp) {
  profile = profile || {};
  opp = opp || {};
  const selected = normalizeSelected(profile);
  const oppPrograms = opp.programs || [];

  const prog = programMap.programMatch(selected, oppPrograms);
  const lc = locations.locationScore(profile.location, opp._loc);
  const role = roleScore(selected, opp.field);
  const skills = skillsScore(selected, opp.skills);

  const raw = prog.score * WEIGHTS.program + lc * WEIGHTS.location +
              role * WEIGHTS.role + skills * WEIGHTS.skills;
  const scored = clamp(raw * 100);
  const explanation = buildExplanation({ programs: selected, location: profile.location || null }, opp, prog, lc, role, skills);
  const checks = buildChecks({ programs: selected, location: profile.location || null }, opp, prog, lc, role, skills);

  return {
    score: scored,
    program: { score: prog.score, tier: prog.tier, matches: prog.matches },
    location: lc,
    role: role,
    skills: skills,
    weights: WEIGHTS,
    explanation: explanation,
    checks: checks,
    breakdown: {
      program: Math.round(prog.score * WEIGHTS.program * 100),
      location: Math.round(lc * WEIGHTS.location * 100),
      role: Math.round(role * WEIGHTS.role * 100),
      skills: Math.round(skills * WEIGHTS.skills * 100)
    }
  };
}
/**
 * Build a transparent, criteria-based checklist explaining WHY an opportunity
 * matched. Each check carries its own state so the UI can render ✓ / △ / ✗.
 * Nothing here is random - every value comes from the real program mapping,
 * resolved location, and role/skills comparison done above.
 */
function buildChecks(profile, opp, prog, lc, role, skills) {
  const selNames = (profile.programs || []).map((c) => programMap.displayName(c));
  const oppLoc = opp._loc;
  const locLabel = oppLoc && oppLoc.label ? oppLoc.label : (opp.location || 'unlisted location');
  const roleField = opp.field || 'not specified';

  let programLabel;
  let programOk;
  if (prog.tier === 'exact') {
    const matched = (prog.matches || []).map((c) => programMap.displayName(c));
    programLabel = matched.length > 1
      ? 'Program: matches ' + matched.join(' & ')
      : 'Program: matches ' + (matched[0] || selNames[0] || 'your program');
    programOk = true;
  } else if (prog.tier === 'related') {
    programLabel = 'Program: closely related to your selection';
    programOk = true;
  } else if (prog.tier === 'open') {
    programLabel = 'Program: open to all programs';
    programOk = null;
  } else {
    programLabel = 'Program: ' + (selNames.length ? selNames.join(' & ') : 'not restricted');
    programOk = false;
  }

  const locOk = lc >= 0.9 ? true : (lc >= 0.5 ? null : false);
  const roleOk = role >= 0.7 ? true : (role >= 0.4 ? null : false);
  const skillOk = skills >= 0.6 ? true : (skills >= 0.35 ? null : false);

  return [
    { key: 'program', label: programLabel, ok: programOk },
    { key: 'location', label: 'Location: ' + locLabel, ok: locOk },
    { key: 'role', label: 'Role relevance: ' + roleField, ok: roleOk },
    { key: 'skills', label: 'Skills fit: ' + (skills >= 0.6 ? 'strong' : skills >= 0.35 ? 'partial' : 'limited'), ok: skillOk }
  ];
}
function buildExplanation(profile, opp, prog, lc, role, skills) {
  const selNames = (profile.programs || []).map((c) => programMap.displayName(c));
  const oppLoc = opp._loc || null;
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
    programPart = 'your program is closely related to one of the accepted programs.';
  } else if (prog.tier === 'open') {
    kind = 'Open opportunity';
    programPart = 'this opportunity is open to all programs.';
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
  computeMatch: computeMatch,
  matchOpportunity: computeMatch,
  filterAndRank: filterAndRank,
  companyMatchesPrograms: companyMatchesPrograms,
  dedupeByCompany: dedupeByCompany,
  eligibility: eligibility,
  WEIGHTS: WEIGHTS,
  programMatch: programMap.programMatch,
  roleScore: roleScore,
  skillsScore: skillsScore
};
