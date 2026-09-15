const db = require('./src/db');
db.initSchema();
const rows = db.all("SELECT id, company_name, province, website, source_url FROM companies WHERE official_website IS NULL OR official_website = ''");
console.log('MISSING=' + rows.length);
for (const r of rows) console.log(r.id + ' | ' + r.company_name + ' | ' + (r.province || '') + ' | w:' + (r.website || '-') + ' | s:' + (r.source_url || '-'));