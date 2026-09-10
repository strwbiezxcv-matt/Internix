'use strict';

/**
 * Public browsing API - companies directory + internship opportunities.
 * No authentication required. Internix is a discovery platform: students browse
 * and are directed to official external sources for application.
 */

const db = require('../db');
const loaders = require('../loaders');
const { ok, fail } = require('../util');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function searchOver(o, q) {
  const hay = norm([
    o.position, o.description, o.company_name, o.location,
    (o.programs || []).join(' '), (o.program_names || []).join(' '),
    (o.skills || []).join(' '), (o.specializations || []).join(' ')
  ].join(' '));
  return hay.includes(q);
}

function locationMatches(oppLocation, wanted) {
  const w = norm(wanted);
  if (!w) return true;
  const loc = norm(oppLocation);
  if (loc.includes(w)) return true;
  return false;
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
      'SELECT id, company_name, logo_url, description, address, location, city, province, region, industry, contact_info, website, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at FROM companies WHERE id = ?',
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
      const res = loaders.resolveProgramKey(qp.program);
      if (res) {
        all = all.filter((o) =>
          (o.programs || []).some((p) => norm(p) === norm(res.code)) ||
          (res.specialization && (o.specializations || []).some((s) => norm(s) === norm(res.specialization))));
      }
    }
    if (qp.location) {
      const w = norm(qp.location);
      if (w) all = all.filter((o) => locationMatches(o.location, qp.location));
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
    if (sort === 'company') {
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