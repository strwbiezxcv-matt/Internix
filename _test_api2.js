const { spawn, g, waitForServer } = require('./_test_full.js');

(async () => {
  const serverProcess = spawn(process.execPath, ['src/server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  serverProcess.stdout.on('data', d => stdout += d);
  serverProcess.stderr.on('data', d => stderr += d);

  const started = await waitForServer();
  console.log('Server started:', started);

  if (!started) {
    console.log('STDOUT:', stdout);
    console.log('STDERR:', stderr);
    process.exit(1);
  }

  // Test all endpoints
  console.log('\n=== API ENDPOINT TESTS ===');

  const catalog = await g('/api/catalog');
  console.log('GET /api/catalog:', catalog.status);
  if (catalog.json && catalog.json.data) {
    const d = catalog.json.data;
    console.log('  programs:', d.programs ? d.programs.length : 0);
    console.log('  program_options:', d.program_options ? d.program_options.length : 0);
    console.log('  skills:', d.skills ? d.skills.length : 0);
    console.log('  fields:', d.fields ? d.fields.length : 0);
    console.log('  locations:', d.locations ? JSON.stringify(d.locations) : 'none');
  }

  const companies = await g('/api/companies');
  console.log('\nGET /api/companies:', companies.status);
  if (companies.json && companies.json.data) {
    console.log('  count:', companies.json.data.length);
    if (companies.json.data[0]) {
      const c = companies.json.data[0];
      console.log('  first:', c.company_name, '| province:', c.province, '| city:', c.city);
      console.log('  relevant_programs:', c.relevant_programs);
      console.log('  _loc:', JSON.stringify(c._loc));
      console.log('  has_verified_opening:', c.has_verified_opening);
    }
  }

  const opps = await g('/api/opportunities');
  console.log('\nGET /api/opportunities:', opps.status);
  if (opps.json && opps.json.data) {
    console.log('  count:', opps.json.data.length);
    if (opps.json.data[0]) {
      const o = opps.json.data[0];
      console.log('  first:', o.position, '| company:', o.company_name);
      console.log('  programs:', o.programs, '| province:', o.province, '| _loc:', JSON.stringify(o._loc));
    }
  }

  // Test static files
  console.log('\n=== STATIC FILE TESTS ===');
  const index = await g('/');
  console.log('GET / (index.html):', index.status, index.body ? index.body.substring(0, 100) : '(empty)');
  const appjs = await g('/app.js');
  console.log('GET /app.js:', appjs.status, appjs.body ? appjs.body.substring(0, 80) : '(empty)');
  const css = await g('/styles.css');
  console.log('GET /styles.css:', css.status, css.body ? css.body.substring(0, 80) : '(empty)');

  console.log('\n=== FILTER TESTS ===');
  const coBul = await g('/api/companies?province=Bulacan');
  console.log('companies?province=Bulacan:', coBul.status, coBul.json ? coBul.json.data.length : 0, 'companies');
  if (coBul.json && coBul.json.data.length) console.log('  first province:', coBul.json.data[0].province);

  const coMet = await g('/api/companies?province=Metro+Manila');
  console.log('companies?province=Metro Manila:', coMet.status, coMet.json ? coMet.json.data.length : 0, 'companies');

  const coProg = await g('/api/companies?program=BSIT');
  console.log('companies?program=BSIT:', coProg.status, coProg.json ? coProg.json.data.length : 0, 'companies');

  const oppBul = await g('/api/opportunities?location=Bulacan');
  console.log('opportunities?location=Bulacan:', oppBul.status, oppBul.json ? oppBul.json.data.length : 0, 'opps');

  const oppMet = await g('/api/opportunities?location=Metro+Manila');
  console.log('opportunities?location=Metro Manila:', oppMet.status, oppMet.json ? oppMet.json.data.length : 0, 'opps');

  console.log('\n=== MATCH TEST ===');
  const matchIt = await g('/api/match', 'POST', { programs: ['BSIT'], location: 'Bulacan' });
  console.log('POST /api/match (BSIT+Bulacan):', matchIt.status);
  if (matchIt.json && matchIt.json.data) {
    const d = matchIt.json.data;
    console.log('  results:', d.results ? d.results.length : 0);
    console.log('  total_companies:', d.total_companies);
    if (d.results && d.results.length) {
      d.results.slice(0,3).forEach(r => console.log('  ', r.match.score+'%', r.opportunity.position, '| prov:', r.opportunity.province));
    }
    if (d.companies && d.companies.length) {
      console.log('  related companies:', d.companies.slice(0,5).map(c=>c.company_name));
    }
  }

  const matchBsba = await g('/api/match', 'POST', { programs: ['BSBA'], location: 'Metro Manila' });
  console.log('\nPOST /api/match (BSBA+MM):', matchBsba.status, 'results:', matchBsba.json && matchBsba.json.data ? matchBsba.json.data.results.length : 0);

  // Test detail endpoints
  console.log('\n=== DETAIL TESTS ===');
  if (companies.json && companies.json.data.length) {
    const cid = companies.json.data[0].id;
    const cd = await g('/api/companies/' + cid);
    console.log('GET /api/companies/' + cid + ':', cd.status);
    if (cd.json && cd.json.data) {
      console.log('  company:', cd.json.data.company ? cd.json.data.company.company_name : 'NO');
      console.log('  keys:', Object.keys(cd.json.data.company || {}).join(','));
      console.log('  official_website:', cd.json.data.company ? cd.json.data.company.official_website : 'N/A');
    }
  }
  if (opps.json && opps.json.data.length) {
    const oid = opps.json.data[0].id;
    const od = await g('/api/opportunities/' + oid);
    console.log('GET /api/opportunities/' + oid + ':', od.status);
    if (od.json && od.json.data) {
      console.log('  opp:', od.json.data.opportunity ? od.json.data.opportunity.position : 'NO');
    }
  }

  console.log('\n=== SERVER STDERR ===');
  console.log(stderr.substring(0, 3000));

  serverProcess.kill();
  process.exit(0);
})();
