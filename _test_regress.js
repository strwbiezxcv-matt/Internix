'use strict';
// Supplemental regression: program/search filters, match endpoint, plus-urls.
const { createServer } = require('./src/app');
const PORT = 4816;
const server = createServer();

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = require('node:http').request(
      { host: '127.0.0.1', port: PORT, path, method,
        headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (res) => { let b=''; res.on('data',(c)=>b+=c); res.on('end',()=>resolve({status:res.statusCode,body:b})); }
    );
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  let pass=0, fail=0;
  const check=(n,c,e)=>{ if(c){pass++;console.log('  PASS  '+n);}else{fail++;console.log('  FAIL  '+n+(e?'  -> '+e:''));} };

  // Program filter via qp.program with URL-encoded value
  let r = await req('GET','/api/opportunities?program=BSIT');
  let arr = JSON.parse(r.body).data || [];
  check('opportunities?program=BSIT returns >0', arr.length> 0, 'len='+arr.length);

  // Search "web development" (space via +)
  r = await req('GET','/api/opportunities?q=Web+Development');
  arr = JSON.parse(r.body).data || [];
  check('opportunities?q=Web+Development returns >0', arr.length>0, 'len='+arr.length);

  // Company program filter
  r = await req('GET','/api/companies?program=BSIT');
  arr = JSON.parse(r.body).data || [];
  check('companies?program=BSIT returns >0', arr.length>0, 'len='+arr.length);

  // Match endpoint: BSIT + Bulacan
  r = await req('POST','/api/match',{program:'BSIT', location:'Bulacan'});
  const m = JSON.parse(r.body).data || {};
  check('match BSIT/Bulacan returns results', Array.isArray(m.results) && m.results.length>0, 'results='+(m.results||[]).length);
  if (Array.isArray(m.results) && m.results.length) {
    const locs = m.results.map((r)=>r.opportunity && r.opportunity._loc && r.opportunity._loc.province);
    check('all match results are in Bulacan', locs.length>0 && locs.every((l)=>String(l).toLowerCase().includes('bulacan')), 'loc='+[...new Set(locs)].join('|'));
  }

  // A real investigator: match endpoint should also work for Metro Manila
  r = await req('POST','/api/match',{program:'BSBA', location:'Metro Manila'});
  const m2 = JSON.parse(r.body).data || {};
  check('match BSBA/Metro Manila returns results', Array.isArray(m2.results) && m2.results.length>0, 'results='+(m2.results||[]).length);

  console.log('\nTotal: '+pass+' passed, '+fail+' failed');
  server.close(); process.exit(fail?1:0);
})().catch((e)=>{console.error(e); server.close(); process.exit(1);});