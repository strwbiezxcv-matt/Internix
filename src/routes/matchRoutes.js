'use strict';

/**
 * Public Program-Based Matching endpoint.
 *
 * POST /api/match
 * Body: { program, specialization, location, work_arrangement }
 *
 * No authentication required. The selected program is the primary input; the
 * profile is processed in-memory only (nothing is persisted).
 *
 * Returns BOTH:
 *  - results: ranked internship opportunities with compatibility scores
 *  - companies: relevant companies (with or without current openings)
 *
 * This avoids the "zero opportunities = zero companies" mistake. A company can
 * be relevant to a program even when it has no active internship listing.
 */

const db = require('../db');
const loaders = require('../loaders');
const matching = require('../matching');
const { ok, fail } = require('../util');

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function register(router) {
  router.post('/api/match', (ctx) => {
    const b = ctx.body || {};
    const resolved = loaders.resolveProgramKey(b.program || null);
    if (!resolved) return fail(ctx.res, 'Please select your academic program.', 400);

    const profile = {
      program: resolved.code,
      specialization: b.specialization || resolved.specialization || null,
      location: b.location || null,
      work_arrangement: b.work_arrangement || null
    };

    let all;
    try {
      all = loaders.loadAllOpenOpportunities();
    } catch {
      return fail(ctx.res, 'Failed to load opportunities.', 500);
    }

    // --- Rank opportunities ---
    const oppResults = all.map((opp) => ({
      opportunity: opp,
      match: matching.computeMatch(profile, opp)
    }));
    oppResults.sort((a, b) => b.match.score - a.match.score);

    // --- Find relevant companies ---
    // A company is relevant if:
    //  1. It has an internship opportunity that matches the program, OR
    //  2. It is directly tagged with the program name / specialization
    const companies = loaders.loadAllCompanies();
    const matchedCompanyIds = new Set();

    const relevantCompanies = companies
      .map((c) => {
        const opps = all.filter((o) => o.company_id === c.id && !o.is_expired);
        const hasMatchingOpp = opps.some((o) =>
          (o.programs || []).some((p) => norm(p) === norm(resolved.code)) ||
          (resolved.specialization && (o.specializations || []).some((s) => norm(s) === norm(resolved.specialization)))
        );

        const hasDirectTag = (c.relevant_programs || []).some((p) => norm(p) === norm(resolved.name)) ||
          (resolved.specialization && (c.relevant_specializations || []).some((s) => norm(s) === norm(resolved.specialization)));

        if (hasMatchingOpp || hasDirectTag) {
          matchedCompanyIds.add(c.id);
          return {
            ...c,
            opportunities: opps.map((o) => ({
              id: o.id,
              position: o.position,
              location: o.location,
              work_arrangement: o.work_arrangement,
              source_url: o.source_url,
              source_name: o.source_name,
              program_names: o.program_names,
              programs: o.programs,
              verified_at: o.verified_at,
              last_verified_at: o.last_verified_at,
              is_expired: o.is_expired
            })),
            has_verified_opening: opps.some((o) => !o.is_expired),
            matched_via: hasMatchingOpp ? 'internship_listing' : 'company_directory'
          };
        }
        return null;
      })
      .filter(Boolean);

    // Add companies directly tagged with the program even if they have no
    // matching opportunity in our database (company directory entries).
    for (const c of companies) {
      if (matchedCompanyIds.has(c.id)) continue;
      const hasDirectTag = (c.relevant_programs || []).some((p) => norm(p) === norm(resolved.name)) ||
        (resolved.specialization && (c.relevant_specializations || []).some((s) => norm(s) === norm(resolved.specialization)));
      if (hasDirectTag) {
        matchedCompanyIds.add(c.id);
        relevantCompanies.push({
          ...c,
          opportunities: [],
          has_verified_opening: false,
          matched_via: 'company_directory'
        });
      }
    }

    // Sort companies: those with openings first, then by name.
    relevantCompanies.sort((a, b) => {
      if (a.has_verified_opening !== b.has_verified_opening) return (b.has_verified_opening ? 1 : 0) - (a.has_verified_opening ? 1 : 0);
      return String(a.company_name || '').localeCompare(String(b.company_name || ''));
    });

    return ok(ctx.res, {
      profile: {
        program: resolved.code,
        program_name: resolved.name,
        specialization: profile.specialization,
        location: profile.location,
        work_arrangement: profile.work_arrangement
      },
      results: oppResults,
      companies: relevantCompanies,
      total_opportunities: oppResults.length,
      total_companies: relevantCompanies.length
    });
  });
}

module.exports = { register };