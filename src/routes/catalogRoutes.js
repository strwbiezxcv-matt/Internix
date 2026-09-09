'use strict';

const db = require('../db');
const util = require('../util');

function register(router) {
  // Academic catalogue: programs (with specializations + fields), skills, fields.
  router.get('/api/catalog', (ctx) => {
    const fieldNames = (sql, id) => db.all(sql, id).map((r) => r.name);
    const programs = db.all('SELECT id, code, name FROM programs ORDER BY id');
    const withSpecs = programs.map((p) => {
      const specializations = db.all(
        'SELECT id, name FROM specializations WHERE program_id = ? ORDER BY name', p.id
      ).map((s) => ({
        id: s.id,
        name: s.name,
        fields: fieldNames(
          'SELECT f.name FROM specialization_fields sf JOIN internship_fields f ON f.id = sf.field_id WHERE sf.specialization_id = ? ORDER BY f.name',
          s.id
        )
      }));
      return {
        ...p,
        fields: fieldNames(
          'SELECT f.name FROM program_fields pf JOIN internship_fields f ON f.id = pf.field_id WHERE pf.program_id = ? ORDER BY f.name',
          p.id
        ),
        specializations
      };
    });
    const skills = db.all('SELECT id, name, category FROM skills ORDER BY name');
    const fields = db.all('SELECT id, name FROM internship_fields ORDER BY name');
    return util.ok(ctx.res, { programs: withSpecs, skills, fields });
  });
}

module.exports = { register };