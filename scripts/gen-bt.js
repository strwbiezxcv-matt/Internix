// Generator for browser-test.js
const fs = require('fs');
const p = 'tests/browser-test.js';

function add(s) { fs.appendFileSync(p, s); }

fs.writeFileSync(p, `'use strict';
/* ============================================================
   Internix - Full browser verification test.
   Tests actual interactions in headless Chrome via CDP.
   ============================================================ */
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
const CDP_PORT = 9223;
const APP = 'http://localhost:3000';

const results = [];
const log = (name, pass, info) => { results.push(\`\${pass ? 'PASS' : 'FAIL'}  \${name}  \${info || ''}\`); console.log(results[results.length - 1]); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jsErrors = [];
const consoleErrors = [];
const httpErrors = [];
const failedRequests = [];

function fetchJson(url, opts) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {}), (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }); } catch { resolve({ status: res.statusCode, json: null }); } });
    });
    req.on('error', reject);
    if (opts && opts.body != null) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

function connectCdp() {
  return new Promise(async (resolve, reject) => {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await fetchJson(\`http://127.0.0.1:\${CDP_PORT}/json/list\`);
        target = (list.json || []).find((t) => t.type === 'page');
        if (!target) await sleep(300);
      } catch { await sleep(300); }
    }
    if (!target) return reject(new Error('CDP page target not found'));
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.binaryType = 'arraybuffer';
    let nextId = 0;
    const pending = new Map();
    const listeners = [];
    ws.addEventListener('open', () => resolve({
      send: (method, params) => new Promise((res, rej) => { const id = ++nextId; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params: params || {} })); }),
      onEvent: (fn) => listeners.push(fn),
      close: () => { try { ws.close(); } catch {} }
    }));
    ws.addEventListener('message', (ev) => {
      let data = ev.data;
      if (data instanceof ArrayBuffer) data = new TextDecoder().decode(data);
      else if (data && data.buffer && data.byteLength !== undefined) data = new TextDecoder().decode(data.buffer);
      let msg = null;
      try { msg = JSON.parse(data); } catch { return; }
      for (const fn of listeners) { try { fn(msg); } catch {} }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.rej(new Error(JSON.stringify(msg.error).slice(0, 200))); else p.res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(new Error('WS error: ' + (e.message || 'unknown'))));
  });
}

let CDP = null;
async function evaluate(expression) {
  const r = await CDP.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('Page eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result ? r.result.value : undefined;
}
async function waitFor(expression, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await evaluate(expression)) return true; } catch {}
    await sleep(250);
  }
  return false;
}
async function goto(hash) { await evaluate(\`location.hash = '\${hash}'\`); await sleep(500); }
async function screenshot(name) {
  try { const r = await CDP.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(__dirname, \`_browser_fail_\${name}.png\`), Buffer.from(r.data, 'base64')); } catch {}
}

function wireCollectors() {
  CDP.onEvent((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      jsErrors.push((d.exception && d.exception.description) || d.text || 'unknown exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'assert')) {
      consoleErrors.push((msg.params.args || []).map((a) => a.value != null ? String(a.value) : (a.description || a.type)).join(' '));
    } else if (msg.method === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.url.startsWith(APP) && r.status >= 400) httpErrors.push(\`\${r.status} \${r.url}\`);
    } else if (msg.method === 'Network.loadingFailed') {
      failedRequests.push(msg.params.errorText || 'failed');
    }
  });
}
`);

console.log('Part 1 written');
