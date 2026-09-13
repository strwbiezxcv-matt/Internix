'use strict';
/* ============================================================
   Internix — production "build" check.

   This application is a zero-dependency, server-rendered Node
   app with no compile step, so a real "build" is a validation
   pass that guarantees the app can start and serve:

     1. every JS file parses (no syntax errors)
     2. the stylesheet is well-formed (balanced braces)
     3. the database exists, its schema initialises, and the
        company catalogue is present (seed data intact)

   Exit code 0 on success, 1 on failure.
   ============================================================ */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const publicDir = path.join(ROOT, 'public');
const srcDir = path.join(ROOT, 'src');

let failures = 0;
const fail = (msg) => { console.error('BUILD FAIL: ' + msg); failures++; };
const pass = (msg) => { console.log('  ok     ' + msg); };

function parseCheck(filePath) {
  let src;
  try {
    src = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    return fail('cannot read ' + filePath + ' (' + e.message + ')');
  }
  try {
    new Function(src); // parse only — never executed
    pass('parses  ' + path.basename(filePath));
  } catch (e) {
    fail('syntax  ' + filePath + ' -> ' + e.message);
  }
}

console.log('Internix build check');
console.log('--- static assets ---');
const assets = ['index.html', 'app.js', 'styles.css'];
for (const a of assets) {
  const p = path.join(publicDir, a);
  if (!fs.existsSync(p)) { fail('missing ' + a); continue; }
  const size = fs.statSync(p).size;
  if (size < 50) { fail(a + ' looks empty'); continue; }
  pass(a + ' present (' + size + ' bytes)');
}

console.log('--- stylesheet integrity ---');
const css = fs.readFileSync(path.join(publicDir, 'styles.css'), 'utf8');
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
if (open === close && open > 0) { pass('styles.css braces balanced (' + open + ')'); }
else fail('styles.css brace mismatch open=' + open + ' close=' + close);

console.log('--- client JS syntax ---');
parseCheck(path.join(publicDir, 'app.js'));

console.log('--- server JS syntax ---');
for (const file of fs.readdirSync(srcDir)) {
  if (file.endsWith('.js')) parseCheck(path.join(srcDir, file));
}

console.log('--- data layer ---');
try {
  const config = require('../src/config');
  const db = require('../src/db');
  db.initSchema();

  // Mirror server.js bootstrap: seed the database when it is empty and seeding
  // is enabled. seedAll() is fully idempotent (ensure/upsert everywhere), so
  // running it here never duplicates or destroys existing local data — it only
  // guarantees that a fresh production environment (e.g. Vercel, where the
  // SQLite file does not exist yet) gets the full company/program/opportunity
  // catalogue before validation runs.
  if (config.seedData && db.get('SELECT COUNT(*) AS c FROM programs').c === 0) {
    const { seedAll } = require('../src/seed');
    seedAll();
  }

  const companies = db.get('SELECT COUNT(*) AS c FROM companies').c;
  const programs = db.get('SELECT COUNT(*) AS c FROM programs').c;
  const opps = db.get('SELECT COUNT(*) AS c FROM internship_opportunities').c;
  pass('database schema initialised');
  pass('companies = ' + companies + ', programs = ' + programs + ', opportunities = ' + opps);
  if (companies < 1) fail('no company records found');
  if (programs < 1) fail('no program records found');
} catch (e) {
  fail('data layer error -> ' + e.message);
}

console.log('---');
if (failures > 0) {
  console.error('BUILD FAILED with ' + failures + ' problem(s).');
  process.exit(1);
} else {
  console.log('BUILD SUCCEEDED — Internix is ready to serve.');
}