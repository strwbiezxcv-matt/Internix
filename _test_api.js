const http = require('http');
async function g(p) {
  return new Promise((res, rej) => {
    http.get('http://localhost:3000' + p, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res({ status: r.statusCode, body: d }));
    }).on('error', e => res({ status: 'ERR', body: e.message }));
  });
}
(async () => {
  const tests = ['/api/catalog', '/api/companies', '/api/opportunities'];
  for (const t of tests) {
    try {
      const r = await g(t);
      console.log(t, r.status, r.body ? r.body.substring(0, 300) : '(empty)');
    } catch (e) {
      console.log(t, 'EXCEPTION', e.message);
    }
  }
  const r2 = await g('/api/match');
  console.log('/api/match (GET, should be 404)', r2.status);

  // Test POST /api/match
  const postData = JSON.stringify({ programs: ['BSIT'], location: 'Bulacan' });
  const postReq = http.request('http://localhost:3000/api/match', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  }, (r) => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => {
      console.log('POST /api/match status:', r.statusCode, 'body:', d.substring(0, 300));
    });
  });
  postReq.on('error', e => console.log('POST /api/match ERROR', e.message));
  postReq.write(postData);
  postReq.end();
})();