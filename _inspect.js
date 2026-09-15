const db = require('./src/db');
db.initSchema();
const by = db.all('SELECT province, region, COUNT(*) c FROM companies GROUP BY province, region');
console.log(JSON.stringify(by));
const bul = db.all("SELECT company_name, city, municipality FROM companies WHERE lower(coalesce(province,'')) LIKE '%bulacan%' OR lower(coalesce(region,'')) LIKE '%bulacan%'");
console.log('--- BULACAN ---');
bul.forEach((r) => console.log(r.company_name + ' | ' + (r.municipality || r.city || '-')));
const mm = db.all("SELECT COUNT(*) c FROM companies WHERE lower(coalesce(province,'')) LIKE '%metro manila%'");
console.log('MM count:', mm[0].c);
