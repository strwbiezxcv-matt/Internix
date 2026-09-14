'use strict';

const db = require('../db');
const util = require('../util');
const loaders = require('../loaders');

function register(router) {
  // Academic catalogue: programs (full names), user-selectable program options,
  // skills, fields, locations and work arrangements.
  router.get('/api/catalog', (ctx) => {
    const fieldNames = (sql, id) => db.all(sql, id).map((r) => r.name);
    const programs = db.all('SELECT id, code, name, description FROM programs ORDER BY id');
    const withSpecs = programs.map((p) => {
      const specializations = db.all(
        'SELECT s.id, s.name, p.name AS parent_name FROM specializations s JOIN programs p ON p.id = s.program_id WHERE s.program_id = ? ORDER BY s.name',
        p.id
      ).map((s) => ({
        id: s.id,
        name: s.name,
        parent_name: s.parent_name,
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
    return util.ok(ctx.res, {
      programs: withSpecs,
      program_options: loaders.listProgramOptions(), // full-name selectable programs
      skills,
      fields,
      // Flat list of selectable regions so the front end can iterate it directly
      // (and it matches the region definitions used by the Companies section).
      locations: loaders.LOCATIONS.regions,
      // Grouped municipalities for optgroup dropdowns — single source of truth
      // used by every section (Home, Opportunities, Companies, Find My Matches).
      bulacan: loaders.LOCATIONS.bulacan,
      metro: loaders.LOCATIONS.metro,
      work_arrangements: ['On-site', 'Hybrid', 'Remote']
    });
  });
}

module.exports = { register };