'use strict';

/**
 * Student routes. Every handler enforces row-level ownership: a student may
 * only access their own profile, saved items, and applications.
 */

const db = require('../db');
const loaders = require('../loaders');
const matching = require('../matching');
const { ok, fail } = require('../util');

function requireStudent(ctx) {
  if (!ctx.user) return fail(ctx.res, 'Not authenticated.', 401);
  if (ctx.user.role !== 'student' || !ctx.user.student) {
    return fail(ctx.res, 'Student account required.', 403);
  }
  return null;
}

function register(router) {
  /* ----------------------------- profile ----------------------------- */

  router.get('/api/student/profile', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const prof = loaders.studentProfile(ctx.user.student.id);
    return ok(ctx.res, prof);
  });

  router.put('/api/student/profile', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const b = ctx.body || {};
    const sid = ctx.user.student.id;

    const fullName = (b.fullName || '').toString().trim();
    let programId = parseInt(b.programId, 10) || null;
    const specializationId = b.specializationId ? parseInt(b.specializationId, 10) : null;
    const preferredFieldId = b.preferredFieldId ? parseInt(b.preferredFieldId, 10) : null;
    const preferredLocation = (b.preferredLocation || '').toString().trim();
    const workArrangement = (b.workArrangement || '').toString().trim();
    const internshipDuration = (b.internshipDuration || '').toString().trim();

    if (!programId) {
      const prog = db.get('SELECT id FROM programs WHERE code = ?', String(b.programCode || 'BSIT').toUpperCase());
      programId = prog ? prog.id : programId;
    }
    if (!fullName) return fail(ctx.res, 'Full name is required.');
    if (!programId) return fail(ctx.res, 'Please choose a course/program.');

    db.transaction(() => {
      db.run(
        `UPDATE students SET full_name = ?, program_id = ?, specialization_id = ?,
           preferred_field_id = ?, preferred_location = ?, work_arrangement = ?,
           internship_duration = ?, updated_at = datetime('now')
         WHERE id = ?`,
        fullName, programId, specializationId, preferredFieldId,
        preferredLocation, workArrangement, internshipDuration, sid
      );

      // Replace skill links
      db.run('DELETE FROM student_skills WHERE student_id = ?', sid);
      const skills = Array.isArray(b.skills) ? b.skills : [];
      for (const raw of skills) {
        const name = String(raw).trim();
        if (!name) continue;
        const row = db.get('SELECT id FROM skills WHERE lower(name) = lower(?)', name);
        if (row) db.run('INSERT OR IGNORE INTO student_skills (student_id, skill_id) VALUES (?, ?)', sid, row.id);
      }

      // Replace interest links
      db.run('DELETE FROM student_interests WHERE student_id = ?', sid);
      const interests = Array.isArray(b.interests) ? b.interests : [];
      for (const raw of interests) {
        const name = String(raw).trim();
        if (!name) continue;
        // Accept either field id or field name
        const row = /^\d+$/.test(name)
          ? db.get('SELECT id FROM internship_fields WHERE id = ?', parseInt(name, 10))
          : db.get('SELECT id FROM internship_fields WHERE lower(name) = lower(?)', name);
        if (row) db.run('INSERT OR IGNORE INTO student_interests (student_id, field_id) VALUES (?, ?)', sid, row.id);
      }
    });

    return ok(ctx.res, loaders.studentProfile(sid));
  });

  /* --------------------------- saved items --------------------------- */

  router.get('/api/student/saved', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;
    const rows = db.all(
      `SELECT opportunity_id FROM saved_opportunities
        WHERE student_id = ? ORDER BY saved_at DESC`, sid
    );
    const prof = loaders.studentProfile(sid);
    const items = rows.map((r) => {
      const opp = loaders.loadOpportunity(r.opportunity_id);
      if (!opp) return null;
      const match = matching.computeMatch(prof, opp);
      return { opportunity: opp, match };
    }).filter(Boolean);
    return ok(ctx.res, items);
  });

  router.post('/api/student/save', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const opportunityId = parseInt(ctx.body?.opportunityId, 10);
    if (!opportunityId) return fail(ctx.res, 'opportunityId is required.');
    if (!db.get('SELECT id FROM internship_opportunities WHERE id = ?', opportunityId)) {
      return fail(ctx.res, 'Opportunity not found.', 404);
    }
    db.run('INSERT OR IGNORE INTO saved_opportunities (student_id, opportunity_id) VALUES (?, ?)',
      ctx.user.student.id, opportunityId);
    return ok(ctx.res, { saved: true });
  });

  router.delete('/api/student/save/:id', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;
    db.run('DELETE FROM saved_opportunities WHERE student_id = ? AND opportunity_id = ?',
      sid, parseInt(ctx.params.id, 10));
    return ok(ctx.res, { saved: false });
  });

/* --------------------------- applications --------------------------- */

  router.post('/api/student/apply', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;
    const opportunityId = parseInt(ctx.body?.opportunityId, 10);
    if (!opportunityId) return fail(ctx.res, 'opportunityId is required.');

    const opp = db.get('SELECT * FROM internship_opportunities WHERE id = ?', opportunityId);
    if (!opp) return fail(ctx.res, 'Opportunity not found.', 404);
    if (opp.status !== 'open') return fail(ctx.res, 'This opportunity is no longer accepting applications.', 409);
    if (db.get('SELECT id FROM applications WHERE student_id = ? AND opportunity_id = ?', sid, opportunityId)) {
      return fail(ctx.res, 'You have already applied to this opportunity.', 409);
    }
    db.run(
      'INSERT INTO applications (student_id, opportunity_id, status) VALUES (?, ?, ?)',
      sid, opportunityId, 'applied'
    );
    return ok(ctx.res, { applied: true });
  });

  router.get('/api/student/applications', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;
    const rows = db.all(
      `SELECT a.id, a.status, a.applied_at, a.updated_at, a.notes,
              o.id AS opportunity_id, o.position, c.company_name, c.logo_url
         FROM applications a
         JOIN internship_opportunities o ON o.id = a.opportunity_id
         JOIN companies c ON c.id = o.company_id
        WHERE a.student_id = ? ORDER BY a.updated_at DESC`, sid
    );
    return ok(ctx.res, rows);
  });

  router.patch('/api/student/applications/:id', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;
    const id = parseInt(ctx.params.id, 10);
    const allowed = ['interested', 'applied', 'withdrawn'];
    const status = String(ctx.body?.status || '');
    const app = db.get('SELECT * FROM applications WHERE id = ? AND student_id = ?', id, sid);
    if (!app) return fail(ctx.res, 'Application not found.', 404);
    if (status === 'withdrawn') {
      db.run('DELETE FROM applications WHERE id = ?', id);
      return ok(ctx.res, { withdrawn: true });
    }
    if (!allowed.includes(status)) return fail(ctx.res, 'Invalid status.');
    db.run('UPDATE applications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', status, id);
    return ok(ctx.res, db.get('SELECT * FROM applications WHERE id = ?', id));
  });

  /* ------------------------- recommendations ------------------------- */

  router.get('/api/student/recommendations', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const prof = loaders.studentProfile(ctx.user.student.id);
    const all = loaders.loadAllOpenOpportunities();
    const scored = all
      .map((opp) => ({ opportunity: opp, match: matching.computeMatch(prof, opp) }))
      .filter((r) => r.match.score >= 40)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 8);
    return ok(ctx.res, scored);
  });

  /* ---------------------------- dashboard ---------------------------- */

  router.get('/api/student/dashboard', (ctx) => {
    const err = requireStudent(ctx);
    if (err) return err;
    const sid = ctx.user.student.id;

    const counts = db.all(
      `SELECT status, COUNT(*) AS total FROM applications
        WHERE student_id = ? GROUP BY status`, sid
    );
    const statusCounts = { interested: 0, applied: 0, interview: 0, accepted: 0, rejected: 0 };
    for (const c of counts) statusCounts[c.status] = c.total;
    const saveCount = db.get('SELECT COUNT(*) AS c FROM saved_opportunities WHERE student_id = ?', sid).c;

    const appliedRows = db.all(
      `SELECT o.id, o.position, o.application_deadline, c.company_name
         FROM applications a
         JOIN internship_opportunities o ON o.id = a.opportunity_id
         JOIN companies c ON c.id = o.company_id
        WHERE a.student_id = ? AND o.application_deadline IS NOT NULL
        ORDER BY o.application_deadline ASC LIMIT 4`, sid
    );

    const prof = loaders.studentProfile(sid);
    const topMatches = loaders.loadAllOpenOpportunities()
      .map((opp) => ({ opportunity: opp, match: matching.computeMatch(prof, opp) }))
      .filter((r) => r.match.score >= 40)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 5);

    return ok(ctx.res, {
      counts: {
        applications: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        saved: saveCount,
        interviews: statusCounts.interview,
        accepted: statusCounts.accepted,
        byStatus: statusCounts
      },
      upcoming_deadlines: appliedRows,
      top_matches: topMatches
    });
  });
}

module.exports = { register };