const db = require('./src/db');
db.initSchema();

console.log('=== Province distribution ===');
const provs = db.all('SELECT province, COUNT(*) c FROM companies GROUP BY province ORDER BY c DESC');
provs.forEach(p => console.log(p.province || 'NULL', p.c));

console.log('=== Region distribution ===');
const regs = db.all('SELECT region, COUNT(*) c FROM companies GROUP BY region ORDER BY c DESC');
regs.forEach(r => console.log(r.region || 'NULL', r.c));

console.log('=== Sample Metro Manila companies ===');
const mm = db.all("SELECT company_name, province, region, city, municipality FROM companies WHERE province LIKE '%Manila%' OR region LIKE '%Manila%' ORDER BY company_name LIMIT 10");
mm.forEach(c => console.log(c.company_name, '|', c.province, '|', c.region, '|', c.city));

console.log('=== Opportunity province distribution ===');
const oppProv = db.all('SELECT province, COUNT(*) c FROM internship_opportunities GROUP BY province ORDER BY c DESC');
oppProv.forEach(p => console.log(p.province || 'NULL', p.c));

console.log('=== Opportunity with _loc check ===');
const loaders = require('./src/loaders');
const allOpps = loaders.loadAllOpenOpportunities();
const metroOpps = allOpps.filter(o => o.province && o.province.toLowerCase().includes('manila'));
console.log('Opportunities with metro manila in province:', metroOpps.length);
const bulacanOpps = allOpps.filter(o => o.province && o.province.toLowerCase() === 'bulacan');
console.log('Opportunities with bulacan province:', bulacanOpps.length);
