'use strict';
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('c:/Users/Matt/Downloads/PROJECT 2/data/internconnect.db');
const rows = db.prepare("SELECT id, company_name, city, municipality, province, region, industry, internship_status, official_website, website, careers_url, source_name, source_url, address FROM companies WHERE id IN (82,102,151,152)").all();
for (const r of rows) console.log(JSON.stringify(r));
const progs = db.prepare('SELECT cp.company_id, p.code FROM company_programs cp JOIN programs p ON p.id=cp.program_id WHERE cp.company_id IN (82,102,151,152) ORDER BY cp.company_id').all();
console.log('PROGRAM LINKS:', JSON.stringify(progs));
const dupes = db.prepare("SELECT company_name, COUNT(*) n FROM companies GROUP BY lower(trim(company_name)) HAVING n > 1").all();
console.log('DUPLICATE NAMES:', JSON.stringify(dupes));
