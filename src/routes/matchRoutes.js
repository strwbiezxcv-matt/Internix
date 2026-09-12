'use strict';

/**
 * Internix - Public Program + Location Matching endpoint.
 *
 * POST /api/match
 * Body: { programs: [code|name, ...], location: 'Bulacan'|'Metro Manila'|'Santa Maria', search }
 *
 * Program matching is driven by each OPPORTUNITY's own accepted-program list
 * (opportunity_programs), and location matching by the opportunity's actual
 * municipality/province - never by a company-level tag or vague region name.
 */

const db = require('../db');
const loaders = require('../loaders');
const matching = require('../matching');
const programMap = require('../programMap');
const locations = require('../locations');
const { ok, fail } = require('../util');

const DEMO_RE = /demo|sample|mock|placeholder|test company/i;

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function resolveProgram(value) {
  if (!value) return null;
  // Accept internal code or full name.
  const s = String(value).trim();
  const row = db.get('SELECT id, code, name FROM programs WHERE code = ? OR lower(name) = lower(?)', s, s);
  return row ? { code: row.code, name: row.name } : null;
}

function parsePrograms(body) {
  let list = body.programs || body.program;
  if (typeof list === 'string') list = [list];
  if (!Array.isArray(list)) list = [];
  const resolved = [];
  const seen = new Set();
  for (const item of list) {
    const r = resolveProgram(item);
    if (r && !seen.has(r.code)) { seen.add(r.code); resolved.push(r); }
  }
  return resolved;
}

function locationInRegion(opp, selection) {
  if (!selection || !selection.province) return true;
  const op = opp && opp._loc ? opp._loc.province : (opp.province || null);
  return op && norm(op) === norm(selection.province);
}

function matchesSearch(opp, q) {
  if (!q) return true;
  const hay = norm([
    opp.company_name, opp.position, opp.description,
    (opp.program_names || []).join(' '),
    (opp.skills || []).join(' '),
    opp.location, opp._loc && opp._loc.label
  ].join(' '));
  return hay.includes(q) || q.split(/\s+/).every((w) => hay.includes(w));
}

function register(router) {
  router.post('/api/match', (ctx) => {
    const b = ctx.body || {};
    const programs = parsePrograms(b);
    if (!programs.length) {
      return fail(ctx.res, 'Please select at least one academic program.', 400);
    }
    const selected = programs.map((p) => p.code);
    const selection = locations.resolveSelection(b.location || null);
    const q = norm(b.search);

    const all = loaders.loadAllOpenOpportunities().filter((o) => {
      if (o.is_expired) return false;
      if (o.company_name && DEMO_RE.test(o.company_name)) return false;
      if (o.position && DEMO_RE.test(o.position)) return false;
      return true;
    });

    // --- Apply hard filters (program eligibility + location region) ---
    let eligible = all.filter((o) => {
      if (!locationInRegion(o, selection)) return false;
      const prog = programMap.programMatch(selected, o.programs || []);
      if (prog.tier === 'mismatch') return false; // explicit incompatible program
      if (!matchesSearch(o, q)) return false;
      return true;
    });

    // --- Rank by compatibility score ---
    const ranked = eligible.map((o) => ({
      opportunity: o,
      match: matching.computeMatch({ programs: selected, location: selection }, o)
    }));
    ranked.sort((a, b) => (b.match.score - a.match.score) ||
      String(a.opportunity.company_name || '').localeCompare(String(b.opportunity.company_name || '')));

    // --- Build deduped, grouping-friendly company info for matched results ---
    const resultCompanies = [];
    const seenIds = new Set();
    for (const r of ranked) {
      const c = r.opportunity.company_id;
      if (seenIds.has(c)) continue;
      seenIds.add(c);
      resultCompanies.push({
        id: c,
        company_name: r.opportunity.company_name,
        location: r.opportunity._loc ? r.opportunity._loc.label : r.opportunity.location
      });
    }

    // --- Related company directory (for "browse related companies") ---
    // Companies physically in the selected region that are relevant to the
    // selected programs, regardless of a specific current opening.
    const allCompanies = loaders.loadAllCompanies();
    const relatedCompanies = allCompanies.filter((c) => {
      if (c.company_name && DEMO_RE.test(c.company_name)) return false;
      if (selection && selection.province) {
        const cp = c._loc ? c._loc.province : c.province;
        if (norm(cp) !== norm(selection.province)) return false;
      }
      const codes = c.relevant_program_codes || [];
      const hit = codes.some((code) => selected.includes(code));
      if (hit) return true;
      const relatedHit = selected.some((sc) => programMap.relatedFor(sc).some((r) => codes.includes(r)));
      if (relatedHit) return true;
      return false;
    });

    return ok(ctx.res, {
      profile: {
        programs: programs,
        program_names: programs.map((p) => p.name),
        location: b.location || null,
        location_resolved: selection
      },
      results: ranked,
      companies: relatedCompanies.map((c) => ({
        id: c.id,
        company_name: c.company_name,
        description: c.description,
        location: c._loc && c._loc.label ? c._loc.label : null,
        municipality: c.municipality || c.city,
        province: c.province,
        industry: c.industry,
        relevant_programs: c.relevant_programs,
        has_verified_opening: c.has_verified_opening
      })),
      total_opportunities: ranked.length,
      total_companies: relatedCompanies.length,
      matched_companies: resultCompanies
    });
  });
}

module.exports = { register };