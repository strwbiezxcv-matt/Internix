'use strict';
/* Integration verification for the Internix production fixes. */
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('path');

const BASE = 'http://localhost:3000';
const results = [];
const log = (name, pass, info) => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info || ''}`); console.log(results[results.length - 1]); };

function get(path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(data) }); } catch (e) { resolve({ status: res.statusCode, json: null }); } });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function waitForServer(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { await get('/api/catalog'); return true; } catch { await new Promise((r) => setTimeout(r, 400)); }
  }
  return false;
}

function statusOf(p) {
  return new Promise((resolve, reject) => {
    const rq = http.request('http://localhost:3101' + p, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, json: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, json: null }); } });
    });
    rq.on('error', reject); rq.end();
  });
}

async function testServerlessEntry() {
  const handler = require('../api/index.js');
  const srv = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => srv.listen(3101, r));
  try {
    for (const p of ['/api/catalog', '/api/companies', '/api/opportunities']) {
      const r = await statusOf(p);
      const d = r.json && r.json.data;
      const n = Array.isArray(d) ? d.length : (d && Object.keys(d).length) || 0;
      log('serverless ' + p, r.status === 200 && n > 0, `status=${r.status} records=${n}`);
    }
  } finally { srv.close(); }
}

(async () => {
  const child = spawn(process.execPath, ['src/server.js'], { cwd: path.resolve(__dirname, '..'), stdio: 'ignore' });
  const up = await waitForServer();
  log('npm start boots', up, up ? 'server responded on :3000' : 'no response within timeout');
  if (up) {
    const cat = await get('/api/catalog');
    const cos = await get('/api/companies');
    const opps = await get('/api/opportunities');
    log('GET /api/catalog', cat.status === 200 && cat.json.data.programs.length > 0, `status=${cat.status} programs=${(cat.json.data.programs || []).length} program_options=${(cat.json.data.program_options || []).length} locations=${(cat.json.data.locations || []).length}`);
    log('GET /api/companies', cos.status === 200 && cos.json.data.length > 0, `status=${cos.status} companies=${cos.json.data.length}`);
    log('GET /api/opportunities', opps.status === 200 && opps.json.data.length > 0, `status=${opps.status} opportunities=${opps.json.data.length}`);

    const named = cos.json.data.map((c) => c.company_name || '');
    const core = ['Easecore', 'Metacom', 'NIA', '3S Offshoring', 'Motolite', 'MDC', 'Berde', 'Acceligent'];
    const foundCore = core.filter((n) => named.some((x) => x.toLowerCase().includes(n.toLowerCase())));
    log('existing companies preserved', foundCore.length >= 5, `matched: ${foundCore.join(', ')}`);

    for (const c of [
      { prog: 'BSIT', loc: 'Bulacan', forbid: 'Metro Manila' },
      { prog: 'BSIT', loc: 'Metro Manila', forbid: 'Bulacan' },
      { prog: 'BSBA', loc: null }, { prog: 'COMPUTER ENGINEERING', loc: null }, { prog: 'INDUSTRIAL ENGINEERING', loc: null }
    ]) {
      const r = await get('/api/match', { programs: [c.prog], location: c.loc });
      const d = r.json && r.json.data;
      if (r.status !== 200 || !d) { log(`match ${c.prog}+${c.loc}`, false, `status=${r.status}`); continue; }
      const oppResults = (d.results || []).map((x) => x.opportunity);
      const cosLoc = d.companies || [];
      let leak = 0;
      if (c.forbid) {
        leak = oppResults.filter((o) => ((o.province || (o._loc && o._loc.province) || o.location || '') + '').includes(c.forbid)).length
             + cosLoc.filter((x) => (x.province || '').includes(c.forbid)).length;
      }
      log(`match ${c.prog} + ${c.loc}`, oppResults.length > 0 && leak === 0, `results=${oppResults.length} relatedCompanies=${cosLoc.length} crossRegionLeaks=${leak}`);
    }

    const provOf = (o) => (o.province || (o._loc && o._loc.province) || '') + '';
    const oppBul = await get('/api/opportunities?location=Bulacan');
    const oppMet = await get('/api/opportunities?location=Metro Manila');
    const oppSM = await get('/api/opportunities?location=Santa Maria');
    log('location filter Bulacan', oppBul.status === 200 && oppBul.json.data.filter((o) => provOf(o) === 'Metro Manila').length === 0, `n=${oppBul.json.data.length}`);
    log('location filter Metro Manila', oppMet.status === 200 && oppMet.json.data.filter((o) => provOf(o) === 'Bulacan').length === 0, `n=${oppMet.json.data.length}`);
    log('location filter municipality (Santa Maria)', oppSM.status === 200, `n=${oppSM.json.data.length} (exact municipality)`);

    const coBul = await get('/api/companies?province=Bulacan');
    const coMet = await get('/api/companies?province=Metro Manila');
    log('companies filter Bulacan', coBul.status === 200 && coBul.json.data.filter((c) => c.province === 'Metro Manila').length === 0, `n=${coBul.json.data.length}`);
    log('companies filter Metro Manila', coMet.status === 200 && coMet.json.data.filter((c) => c.province === 'Bulacan').length === 0, `n=${coMet.json.data.length}`);
    const coSearch = await get('/api/companies?q=metacom');
    log('companies search', coSearch.status === 200 && coSearch.json.data.some((c) => /metacom/i.test(c.company_name || '')), (coSearch.json.data.map((c) => c.company_name).join(', ') || 'none'));
    const coProg = await get('/api/companies?program=BSIT');
    log('companies filter program=BSIT', coProg.status === 200 && coProg.json.data.length > 0, `n=${coProg.json.data.length}`);

    const firstOpp = opps.json.data[0];
    const detail = await get('/api/opportunities/' + firstOpp.id);
    log('opportunity detail (View Details)', detail.status === 200 && detail.json.data.opportunity.id === firstOpp.id, `id=${firstOpp.id}`);
    const coDetail = await get('/api/companies/' + cos.json.data[0].id);
    log('company detail (View Company)', coDetail.status === 200 && coDetail.json.data.company.id === cos.json.data[0].id, `id=${cos.json.data[0].id}`);

    await testServerlessEntry();
  }
  child.kill();
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(`\n${results.length - fails} passed, ${fails} failed`);
  require('fs').writeFileSync(path.join(__dirname, '_verify_fixes.log'), results.join('\n'));
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); child && child.kill(); process.exit(1); });

