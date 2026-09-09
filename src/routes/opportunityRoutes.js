'use strict';

/**
 * Public browsing of internship opportunities, with search + filters.
 * No authentication required — InternConnect is a discovery/matching platform.
 */

const db = require('../db');
const loaders = require('../loaders');
const { ok, fail } = require('../util');

function normalize(q) {
  return String(q || '').trim().toLowerCase();
}

function register(router) {
  /* Companies directory (public) — verified real companies only */
  router.get('/api/companies', (ctx) => {
    const qp = ctx.query || {};
    let companies = loaders.loadAllCompanies();
    if (qp.verification_status) {
      const w = normalize(qp.verification_status);
      companies = companies.filter((c) => normalize(c.verification_status) === w);
    }
    if (qp.q) {
      const q = normalize(qp.q);
      companies = companies.filter((c) =>
        normalize(c.company_name).includes(q) || normalize(c.industry).includes(q));
    }
    return ok(ctx.res, companies);
  });

  /* Company profile (public) */
  router.get('/api/companies/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const c = db.get(
      'SELECT id, company_name, logo_url, description, location, city, province, region, industry, website, careers_url, company_size, year_established, verification_status, source_name, source_url, verified_at FROM companies WHERE id = ?',
      id
    );
    if (!c) return fail(ctx.res, 'Company not found.', 404);
    const opps = loaders.loadAllOpenOpportunities()
      .filter((o) => o.company_id === id && !o.is_expired);
    return ok(ctx.res, {
      company: c,
      opportunities: opps,
      relevant_programs: [...new Set(opps.flatMap((o) => o.programs || []))],
      relevant_fields: [...new Set(opps.map((o) => o.field).filter(Boolean))],
      relevant_skills: [...new Set(opps.flatMap((o) => o.skills || []))]
    });
  });

  /* Browse opportunities (public, with optional filters) */
  router.get('/api/opportunities', (ctx) => {
    const qp = ctx.query || {};
    let all = loaders.loadAllOpenOpportunities();

    if (qp.q) {
      const q = normalize(qp.q);
      all = all.filter((o) =>
        normalize(o.position).includes(q) ||
        normalize(o.description).includes(q) ||
        normalize(o.company_name).includes(q));
    }
    if (qp.program) {
      const want = normalize(qp.program);
      all = all.filter((o) => o.programs.some((p) => normalize(p) === want));
    }
    if (qp.field) {
      const w = normalize(qp.field);
      all = all.filter((o) => normalize(o.field) === w);
    }
    if (qp.location) {
      const w = normalize(qp.location);
      all = all.filter((o) => normalize(o.location).includes(w) || normalize(o.location) === w);
    }
    if (qp.work_arrangement) {
      const w = normalize(qp.work_arrangement);
      all = all.filter((o) => normalize(o.work_arrangement) === w);
    }
    if (qp.industry) {
      const w = normalize(qp.industry);
      all = all.filter((o) => normalize(o.company_industry).includes(w) || normalize(o.company_industry) === w);
    }
    if (qp.duration) {
      const w = normalize(qp.duration);
      all = all.filter((o) => normalize(o.duration) === w);
    }
    if (qp.skill) {
      const want = normalize(qp.skill);
      all = all.filter((o) => o.skills.some((s) => normalize(s) === want));
    }
    if (qp.specialization) {
      const w = normalize(qp.specialization);
      all = all.filter((o) => o.specializations.some((s) => normalize(s) === w));
    }

    // Expired opportunities are hidden unless explicitly requested.
    const includeExpired = qp.include_expired === '1' || qp.include_expired === 'true';
    if (!includeExpired) all = all.filter((o) => !o.is_expired);

    // Verification status filter: 'verified' | 'demo' | '' (any).
    if (qp.verification_status) {
      const w = normalize(qp.verification_status);
      all = all.filter((o) => normalize(o.verification_status) === w);
    }

    // Sort by date posted (newest first) for browsing.
    all.sort((a, b) => String(b.date_posted).localeCompare(String(a.date_posted)));

    return ok(ctx.res, all);
  });

  /* Opportunity detail (public) */
  router.get('/api/opportunities/:id', (ctx) => {
    const id = parseInt(ctx.params.id, 10);
    const opp = loaders.loadOpportunity(id);
    if (!opp) return fail(ctx.res, 'Opportunity not found.', 404);
    return ok(ctx.res, { opportunity: opp });
  });
}

module.exports = { register };