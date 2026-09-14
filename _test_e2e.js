'use strict';
// End-to-end test: verify parseQuery '+' fix restores Metro Manila / Bulacan filtering.
const { createServer } = require('./src/app');
const config = require('./src/config');

const PORT = 4814;
const server = createServer();

function get(path) {
  return new Promise((resolve, reject) => {
    const req = require('node:http').request(
      { host: '127.0.0.1', port: PORT, path, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  let pass = 0, fail = 0;
  const check = (name, cond, extra) => {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
  };

  // 1. Companies filtered by province=Metro+Manila (space-as-'+')
  let r = await get('/api/companies?province=Metro+Manila');
  let arr = JSON.parse(r.body).data || [];
  check('companies?province=Metro+Manila returns >0', arr.length > 0, 'len=' + arr.length);
  check('all Metro Manila companies have province Metro Manila',
    arr.every((c) => (c.province || c.region) === 'Metro Manila'));

  // 2. Companies filtered by province=Bulacan
  r = await get('/api/companies?province=Bulacan');
  arr = JSON.parse(r.body).data || [];
  check('companies?province=Bulacan returns >0', arr.length > 0, 'len=' + arr.length);
  check('all Bulacan companies have province Bulacan',
    arr.every((c) => (c.province || c.region) === 'Bulacan'));

  // 3. Opportunities filtered by location=Metro+Manila
  r = await get('/api/opportunities?location=Metro+Manila');
  arr = JSON.parse(r.body).data || [];
  check('opportunities?location=Metro+Manila returns >0', arr.length > 0, 'len=' + arr.length);
  check('all opps have province Metro Manila',
    arr.every((o) => (o._loc && o._loc.province) === 'Metro Manila'));

  // 4. Opportunities filtered by location=Bulacan
  r = await get('/api/opportunities?location=Bulacan');
  arr = JSON.parse(r.body).data || [];
  check('opportunities?location=Bulacan returns >0', arr.length > 0, 'len=' + arr.length);
  check('all Bulacan opps province Bulacan',
    arr.every((o) => (o._loc && o._loc.province) === 'Bulacan'));

  // 5. Municipality filter: selecting "Santa Maria" must return ONLY Santa Maria
  r = await get('/api/opportunities?location=Santa+Maria');
  arr = JSON.parse(r.body).data || [];
  check('opportunities?location=Santa+Maria returns >0', arr.length > 0, 'len=' + arr.length);
  check('all Santa Maria results only in Santa Maria',
    arr.every((o) => o._loc && (o._loc.municipality || '').toLowerCase().includes('santa maria')),
    'cities=' + [...new Set(arr.map((o) => o._loc && o._loc.municipality))].join('|'));

  // 6. Static index served on /
  r = await get('/');
  check('GET / serves HTML', r.status === 200 && /<!doctype html/i.test(r.body));

  // 7. Static app.js served
  r = await get('/app.js');
  check('GET /app.js serves JS', r.status === 200 && r.body.includes('function oppCard'), 'status=' + r.status);

  console.log('\nTotal: ' + pass + ' passed, ' + fail + ' failed');
  server.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });