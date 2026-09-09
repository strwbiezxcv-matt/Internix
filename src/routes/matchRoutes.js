'use strict';

/**
 * Public Smart Internship Matching endpoint.
 *
 * POST /api/match
 * Body: { name, program, specialization, skills, field, location, work_arrangement, duration, industry }
 *
 * No authentication required. The profile is processed in-memory only — nothing
 * is persisted to the database. Returns ranked opportunities with transparent
 * match scores and explanations.
 */

const loaders = require('../loaders');
const matching = require('../matching');
const { ok, fail } = require('../util');

function register(router) {
  router.post('/api/match', (ctx) => {
    const b = ctx.body || {};
    const profile = {
      full_name: b.name || 'Student',
      program: b.program || null,
      specialization: b.specialization || null,
      skills: Array.isArray(b.skills) ? b.skills : [],
      preferred_field: b.field || null,
      preferred_location: b.location || null,
      work_arrangement: b.work_arrangement || null,
      internship_duration: b.duration || null,
      preferred_industry: b.industry || null
    };

    if (!profile.program) return fail(ctx.res, 'Program/course is required.', 400);

    let all;
    try {
      all = loaders.loadAllOpenOpportunities();
    } catch (err) {
      return fail(ctx.res, 'Failed to load opportunities.', 500);
    }

    const results = all.map((opp) => ({
      opportunity: opp,
      match: matching.computeMatch(profile, opp)
    }));

    results.sort((a, b) => b.match.score - a.match.score);

    return ok(ctx.res, {
      profile,
      results,
      total: results.length
    });
  });
}

module.exports = { register };
