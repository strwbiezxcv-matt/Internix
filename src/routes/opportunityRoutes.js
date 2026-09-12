'use strict';

/**
 * Public browsing API - companies directory + internship opportunities.
 * No authentication required. Internix is a discovery platform: students browse
 * and are directed to official external sources for application.
 */

const db = require('../db');
const loaders = require('../loaders');
const programMap = require('../programMap');
const locations = require('../locations');
const { ok, fail } = require('../util');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function searchOver(o, q) {
  const hay = norm([
    o.position, o.description, o.company_name, o.location,
    o._loc && o._loc.label,
    (o.programs || []).join(' '), (o.program_names || []).join(' '),
    (o.skills || []).join(' '), (o.specializations || []).join(' ')
  ].join(' '));
  return hay.includes(q) || q.split(/\s+/).every((w) => hay.includes(w));
}

// Location filter based on the opportunity's ACTUAL municipality/province.
// A selected municipality matches ONLY that municipality - never the whole
// province (§11: selecting Santa Maria must not return all of Bulacan).
function locationMatches(opp, wanted) {
  const sel = locations.resolveSelection(wanted);
  if (!sel) return true;
  const op = opp._loc;
  if (!op) return false;
  if (sel.municipality) {
    return !!op.municipality && norm(op.municipality) === norm(sel.municipality);
  }
  return !!(op.province && sel.province && norm(op.province) === norm(sel.province));
}

function resolveProgramCode(value) {
  const sel = loaders.resolveProgramKey(value);
  return sel ? sel.code : null;
}

function register(router) {
  /* ------------------------- companies directory ------------------------- */
  router.get('/api/companies', (ctx) => {
    const qp = ctx.query || {};
    let companies = loaders.loadAllCompanies();

    if (qp.q) {
      const q = norm(qp.q);
      companies = companies.filter((c) =>
        norm(c.company_name).includes(q) ||
        norm(c.industry).includes(q) ||
        norm(c.city || '').includes(q) ||
        norm(c.province || '').includes(q) ||
        (c.relevant_programs || []).some((p) => norm(p).includes(q)) ||
        (c.relevant_specializations || []).some((s) => norm(s).includes(q)));
    }
    if (qp.province || qp.region) {
      const r = norm(qp.province || qp.region);
      companies = companies.filter((c) => norm(c.province) === r || norm(c.region) === r);
    }
    if (qp.program) {
      const res = loaders.resolveProgramKey(qp.program);
      if (res) {
        companies = companies.filter((c) => {
          const has = (c.relevant_programs || []).some((p) => norm(p) === norm(res.name));
          if (has) return true;
          return (res.specialization && (c.relevant_specializations || []).some((s) => norm(s) === norm(res.specialization)));
        });
      }
    }
    return ok(ctx.res, companies);
  });

  /* ------------------------- company detail (public) ------------------------- */
  router.get('/api/companies/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const c = db.get(
      'SELECT id, company_name, logo_url, description, address, location, city, municipality, province, region, industry, contact_info, website, official_website, official_website_verified, source_status, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at, internship_status, internship_notes, last_verified_at FROM companies WHERE id = ?',
      id
    );
    if (!c) return fail(ctx.res, 'Company not found.', 404);
    const opps = loaders.loadAllOpenOpportunities().filter((o) => o.company_id === id && !o.is_expired);
    return ok(ctx.res, {
      company: c,
      opportunities: opps,
      relevant_programs: [...new Set(opps.flatMap((o) => o.programs || []))],
      relevant_program_names: [...new Set(opps.flatMap((o) => o.program_names || []))],
      relevant_specializations: [...new Set(opps.flatMap((o) => o.specializations || []))],
      relevant_fields: [...new Set(opps.map((o) => o.field).filter(Boolean))],
      relevant_skills: [...new Set(opps.flatMap((o) => o.skills || []))]
    });
  });

  /* ------------------------- browse opportunities (public) ------------------------- */
  // Filters: q (search), program, location, work_arrangement, company, skill.
  // Field / industry / duration / hours / verification are intentionally NOT
  // exposed - categorization is handled internally.
  router.get('/api/opportunities', (ctx) => {
    const qp = ctx.query || {};
    let all = loaders.loadAllOpenOpportunities().filter((o) => !o.is_expired);

    if (qp.q) {
      const q = norm(qp.q);
      if (q) all = all.filter((o) => searchOver(o, q));
    }
    if (qp.program) {
      const sel = loaders.resolveProgramKey(qp.program);
      if (sel) {
        const code = sel.code;
        all = all.filter((o) => {
          const pm = programMap.programMatch([code], o.programs || []);
          return pm.tier !== 'mismatch'; // exact, related, or open-to-all
        });
      }
    }
    if (qp.location) {
      const w = norm(qp.location);
      if (w) all = all.filter((o) => locationMatches(o, qp.location));
    }
    if (qp.work_arrangement) {
      const w = norm(qp.work_arrangement);
      if (w) all = all.filter((o) => norm(o.work_arrangement) === w);
    }
    if (qp.company) {
      const w = norm(qp.company);
      if (w) all = all.filter((o) => norm(o.company_name).includes(w));
    }
    if (qp.skill) {
      const w = norm(qp.skill);
      if (w) all = all.filter((o) => (o.skills || []).some((s) => norm(s) === w));
    }

    const sort = norm(qp.sort);
    if (qp.location && !sort) {
      // Prioritize opportunities in the exact selected municipality/city;
      // same-province opportunities follow as secondary results.
      const sel = locations.resolveSelection(qp.location);
      const mun = sel && sel.municipality ? norm(sel.municipality) : null;
      if (mun) {
        all.sort((a, b) => {
          const am = a._loc && norm(a._loc.municipality) === mun ? 0 : 1;
          const bm = b._loc && norm(b._loc.municipality) === mun ? 0 : 1;
          return am - bm || String(b.date_posted || '').localeCompare(String(a.date_posted || ''));
        });
      }
    } else if (sort === 'company') {
      all.sort((a, b) => String(a.company_name || '').localeCompare(String(b.company_name || '')));
    } else if (sort === 'position') {
      all.sort((a, b) => String(a.position || '').localeCompare(String(b.position || '')));
    } else {
      all.sort((a, b) => String(b.date_posted || '').localeCompare(String(a.date_posted || '')));
    }

    return ok(ctx.res, all);
  });

  /* ------------------------- opportunity detail (public) ------------------------- */
  router.get('/api/opportunities/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const opp = loaders.loadOpportunity(id);
    if (!opp) return fail(ctx.res, 'Opportunity not found.', 404);
    return ok(ctx.res, { opportunity: opp });
  });
}

module.exports = { register };