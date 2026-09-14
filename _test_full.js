const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const BASE = 'http://localhost:3000';

async function g(p, method='GET', body=null) {
  return new Promise((resolve) => {
    const opts = { method, headers: {} };
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }
    const req = http.request(BASE + p, opts, (r) => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => {
        let json = null;
        try { json = JSON.parse(d); } catch {}
        resolve({ status: r.statusCode, body: d, json });
      });
    });
    req.on('error', (e) => resolve({ status: 'ERR', body: e.message, json: null }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function waitForServer(timeoutMs) {
  timeoutMs = timeoutMs || 20000;
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tryConnect = () => {
      if (Date.now() - t0 > timeoutMs) { resolve(false); return; }
      const req = http.get(BASE + '/api/catalog', (r) => { resolve(true); });
      req.on('error', () => { setTimeout(tryConnect, 400); });
    };
    tryConnect();
  });
}

module.exports = { spawn, g, waitForServer, BASE };
