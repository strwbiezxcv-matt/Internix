'use strict';

/**
 * Company routes. Row-level ownership is enforced: a company may only manage
 * opportunities it created, and only view applicants for those opportunities.
 */

const db = require('../db');
const loaders = require('../loaders');
const { ok, fail } = require('../util');

function requireCompany(ctx) {
  if (!ctx.user) return fail(ctx.res, 'Not authenticated.', 401);
  if (ctx.user.role !== 'company' || !ctx.user.company) {
    return fail(ctx.res, 'Company account required.', 403);
  }
  return null;
}

/**
 * Link many item names/ids (programs/specializations/skills) from a request
 * body into the appropriate join table for an opportunity.
 */
function linkItems(opportunityId, items, tableName, fkCol, joinTable, matchCols) {
  for (const raw of items || []) {
    const value = String(raw).trim();
    if (!value) continue;
    const isId = /^\d+$/.test(value);
    let target = null;
    if (isId) {
      target = db.get(`SELECT id FROM ${tableName} WHERE id = ?`, parseInt(value, 10));
    } else {
      for (const col of matchCols || ['name']) {
        target = db.get(`SELECT id FROM ${tableName} WHERE ${col} = ?`, value);
        if (target) break;
      }
    }
    if (target) {
      db.run(`INSERT OR IGNORE INTO ${joinTable} (opportunity_id, ${fkCol}) VALUES (?, ?)`, opportunityId, target.id);
    }
  }
}

/* ------------------------- opportunity CRUD ------------------------- */

function register(router) {
  router.get('/api/company/dashboard', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const cid = ctx.user.company.id;

    const opportunities = db.all(
      `SELECT o.*, (
         SELECT COUNT(*) FROM applications a
          WHERE a.opportunity_id = o.id
       ) AS applicants_count
         FROM internship_opportunities o
        WHERE o.company_id = ? ORDER BY o.created_at DESC`, cid
    ).map((o) => {
      const full = loaders.loadOpportunity(o.id);
      return { ...o, programs: full ? full.programs : [] };
    });

    return ok(ctx.res, { company: ctx.user.company, opportunities });
  });

  router.post('/api/company/opportunities', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const b = ctx.body || {};
    const position = (b.position || '').toString().trim();
    const description = (b.description || '').toString().trim();
    if (!position) return fail(ctx.res, 'Position is required.');
    if (!description) return fail(ctx.res, 'Description is required.');

    const fieldId = b.field_id ? parseInt(b.field_id, 10) : null;
    const location = (b.location || '').toString().trim();
    const workArrangement = (b.work_arrangement || '').toString().trim();
    const slots = parseInt(b.slots, 10) || 1;
    const duration = (b.duration || '').toString().trim();
    const requiredHours = b.required_hours ? parseInt(b.required_hours, 10) : null;
    const deadline = (b.application_deadline || '').toString().trim();
    const method = (b.application_method || '').toString().trim();

    const id = db.lastInsertId(db.run(
      `INSERT INTO internship_opportunities
         (company_id, position, description, field_id, location, work_arrangement,
          slots, duration, required_hours, application_deadline, application_method, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      ctx.user.company.id, position, description, fieldId,
      location || null, workArrangement || null,
      slots, duration || null, requiredHours, deadline || null, method || null
    ));

    linkItems(id, b.programs, 'programs', 'program_id', 'opportunity_programs', ['name', 'code']);
    linkItems(id, b.specializations, 'specializations', 'specialization_id', 'opportunity_specializations');
    linkItems(id, b.skills, 'skills', 'skill_id', 'opportunity_skills');

    return ok(ctx.res, loaders.loadOpportunity(id), 201);
  });

  router.put('/api/company/opportunities/:id', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const id = parseInt(ctx.params.id, 10);
    if (!findOwned(ctx, id)) return fail(ctx.res, 'Opportunity not found.', 404);
    const b = ctx.body || {};

    const position = (b.position || '').toString().trim();
    const description = (b.description || '').toString().trim();
    if (!position || !description) return fail(ctx.res, 'Position and description are required.');

    db.run(
      `UPDATE internship_opportunities SET
         position = ?, description = ?, field_id = ?, location = ?,
         work_arrangement = ?, slots = ?, duration = ?, required_hours = ?,
         application_deadline = ?, application_method = ?, status = ?
       WHERE id = ?`,
      position, description, b.field_id ? parseInt(b.field_id, 10) : null,
      (b.location || '').toString().trim() || null,
      (b.work_arrangement || '').toString().trim() || null,
      parseInt(b.slots, 10) || 1,
      (b.duration || '').toString().trim() || null,
      b.required_hours ? parseInt(b.required_hours, 10) : null,
      (b.application_deadline || '').toString().trim() || null,
      (b.application_method || '').toString().trim() || null,
      ['open', 'closed'].includes(b.status) ? b.status : 'open',
      id
    );

    db.run('DELETE FROM opportunity_programs WHERE opportunity_id = ?', id);
    db.run('DELETE FROM opportunity_specializations WHERE opportunity_id = ?', id);
    db.run('DELETE FROM opportunity_skills WHERE opportunity_id = ?', id);
    linkItems(id, b.programs, 'programs', 'program_id', 'opportunity_programs', ['name', 'code']);
    linkItems(id, b.specializations, 'specializations', 'specialization_id', 'opportunity_specializations');
    linkItems(id, b.skills, 'skills', 'skill_id', 'opportunity_skills');

    return ok(ctx.res, loaders.loadOpportunity(id));
  });

router.delete('/api/company/opportunities/:id', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const id = parseInt(ctx.params.id, 10);
    if (!findOwned(ctx, id)) return fail(ctx.res, 'Opportunity not found.', 404);
    db.run('DELETE FROM internship_opportunities WHERE id = ?', id);
    return ok(ctx.res, { deleted: true });
  });

  /* ------------------------------ applicants ------------------------------ */

  router.get('/api/company/opportunities/:id/applicants', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const id = parseInt(ctx.params.id, 10);
    if (!findOwned(ctx, id)) return fail(ctx.res, 'Opportunity not found.', 404);
    const rows = db.all(
      `SELECT a.id, a.status, a.applied_at, a.updated_at, a.notes,
              st.full_name, st.preferred_location, st.work_arrangement,
              p.code AS program, sp.name AS specialization
         FROM applications a
         JOIN students st ON st.id = a.student_id
         LEFT JOIN programs p ON p.id = st.program_id
         LEFT JOIN specializations sp ON sp.id = st.specialization_id
        WHERE a.opportunity_id = ? ORDER BY a.updated_at DESC`, id
    );
    return ok(ctx.res, rows);
  });

  router.patch('/api/company/applications/:id', (ctx) => {
    const err = requireCompany(ctx);
    if (err) return err;
    const app = db.get('SELECT * FROM applications WHERE id = ?', parseInt(ctx.params.id, 10));
    if (!app) return fail(ctx.res, 'Application not found.', 404);
    const opp = db.get('SELECT * FROM internship_opportunities WHERE id = ?', app.opportunity_id);
    if (!opp || opp.company_id !== ctx.user.company.id) return fail(ctx.res, 'Not your application.', 403);

    const allowed = ['interested', 'applied', 'interview', 'accepted', 'rejected'];
    const status = String(ctx.body?.status || '');
    if (!allowed.includes(status)) return fail(ctx.res, 'Invalid status.');
    db.run('UPDATE applications SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', status, app.id);
    return ok(ctx.res, db.get('SELECT * FROM applications WHERE id = ?', app.id));
  });
}

function findOwned(ctx, id) {
  return db.get('SELECT id FROM internship_opportunities WHERE id = ? AND company_id = ?', id, ctx.user.company.id);
}

module.exports = { register };