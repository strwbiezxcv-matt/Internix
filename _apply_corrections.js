'use strict';
const fs = require('fs');
const db = require('./src/db');
db.initSchema();

function like(name) {
  return `%${name}%`;
}
const names = ['easecore', 'metacom', 'NIA', 'National Irrigation'];
let rows = [];
for (const n of names) {
  rows = rows.concat(db.all(
    'SELECT id, company_name, city, municipality, province, region, location, address, official_website FROM companies WHERE company_name LIKE ?',
    like(n)
  ));
}
// dedupe by id
const seen = new Set();
rows = rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
fs.writeFileSync('_corrections_scan.txt', JSON.stringify(rows, null, 1));

let opps = [];
for (const n of names) {
  opps = opps.concat(db.all(
    `SELECT o.id, o.company_id, c.company_name, o.municipality, o.city, o.province, o.location
       FROM internship_opportunities o JOIN companies c ON c.id = o.company_id
      WHERE c.company_name LIKE ?`,
    like(n)
  ));
}
const seen2 = new Set();
opps = opps.filter((r) => (seen2.has(r.id) ? false : (seen2.add(r.id), true)));
fs.appendFileSync('_corrections_scan.txt', '\n--- OPPORTUNITIES ---\n' + JSON.stringify(opps, null, 1));
console.log('companies:', rows.length, '| opps:', opps.length);

// ---- APPLY CORRECTIONS ----
const upd = db.run ? null : null;
// Apply via simple UPDATE statements using the db helper.
function run(sql, ...params) {
  if (typeof db.run === 'function') return db.run(sql, ...params);
  if (typeof db.exec === 'function') return db.exec(sql, ...params);
  throw new Error('no db runner');
}

// 1) Easecore -> official website
run("UPDATE companies SET official_website = 'https://easecore.com.ph' WHERE id = 57 AND (official_website IS NULL OR official_website = '')");

// 2) Metacom -> Baliwag, Bulacan
run("UPDATE companies SET municipality = 'Baliwag', city = 'Baliwag', province = 'Bulacan', region = 'Bulacan', location = 'Baliwag, Bulacan', address = 'Baliwag, Bulacan' WHERE id = 83");

// 3) NIA -> Baliwag, Bulacan
run("UPDATE companies SET municipality = 'Baliwag', city = 'Baliwag', province = 'Bulacan', region = 'Bulacan', location = 'Baliwag, Bulacan', address = 'Baliwag, Bulacan' WHERE id = 103");

// Sync denormalized location fields on any opportunities belonging to these companies
run("UPDATE internship_opportunities SET municipality = 'Baliwag', city = 'Baliwag', province = 'Bulacan', region = 'Bulacan', location = 'Baliwag, Bulacan' WHERE company_id = 83");
run("UPDATE internship_opportunities SET municipality = 'Baliwag', city = 'Baliwag', province = 'Bulacan', region = 'Bulacan', location = 'Baliwag, Bulacan' WHERE company_id = 103");
run("UPDATE internship_opportunities SET municipality = 'Santa Maria', city = 'Santa Maria', province = 'Bulacan', location = 'Santa Maria, Bulacan' WHERE company_id = 57");

// ---- VERIFY ----
const after = db.all("SELECT id, company_name, municipality, city, province, region, location, address, official_website FROM companies WHERE id IN (57, 83, 103)");
console.log(JSON.stringify(after, null, 1));
const oppAfter = db.all("SELECT o.id, o.company_id, o.municipality, o.province, o.location FROM internship_opportunities o WHERE o.company_id IN (57, 83, 103)");
console.log('opps:', JSON.stringify(oppAfter, null, 1));
// Duplicate check
const dup = db.all("SELECT company_name, COUNT(*) c FROM companies WHERE company_name LIKE '%etacom%' OR company_name LIKE '%asecore%' OR company_name LIKE '%rrigation%' GROUP BY company_name HAVING c > 1");
console.log('duplicates:', JSON.stringify(dup));

