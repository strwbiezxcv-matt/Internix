'use strict';
/* Dependency-free headless-Chrome driver over the DevTools Protocol, used only
   for local verification (screenshots, computed styles, console errors).
   Not part of the shipped app. */
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);

const CHROME = CANDIDATES.find((p) => fs.existsSync(p));
const PORT = Number(process.env.CDP_PORT || 9333);
const PROFILE = path.join(__dirname, '_cdpprofile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    this.errors = [];
    this.requests = [];
    this.failed = [];
    this.loads = 0;
    this.ws.addEventListener('message', (ev) => this._onMsg(ev.data));
  }
  _onMsg(data) {
    const msg = JSON.parse(data);
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
      return;
    }
    const m = msg.method;
    if (m === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) =>
        a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      this.console.push({ type: msg.params.type, text });
      if (msg.params.type === 'error' || msg.params.type === 'warning') {
        this.errors.push('[console.' + msg.params.type + '] ' + text);
      }
    } else if (m === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      this.errors.push('[exception] ' + d.text + ' ' + ((d.exception && d.exception.description) || ''));
    } else if (m === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') this.errors.push('[log.error] ' + e.text + ' ' + (e.url || ''));
    } else if (m === 'Network.requestWillBeSent') {
      this.requests.push(msg.params.request.url);
    } else if (m === 'Network.responseReceived') {
      const r = msg.params.response;
      if (r.status >= 400) this.failed.push(r.status + ' ' + r.url);
    } else if (m === 'Network.loadingFailed') {
      this.failed.push('FAILED ' + msg.params.errorText);
    } else if (m === 'Page.loadEventFired') {
      this.loads++;
    }
  }
  ready() {
    return new Promise((res, rej) => {
      this.ws.addEventListener('open', () => res());
      this.ws.addEventListener('error', () => rej(new Error('websocket error')));
    });
  }
  async setup(width, height) {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Log.enable');
    await this.send('Network.enable');
    await this.setViewport(width, height);
  }
  async setViewport(width, height, mobile) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: !!mobile
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true
    });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception
        ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    }
    return r.result.value;
  }
  async go(url, waitMs) {
    const before = this.loads;
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      if (this.loads > before) break;
      await sleep(100);
    }
    await sleep(waitMs || 900);
  }
  async shot(file, fullPage) {
    const params = { format: 'png' };
    if (fullPage) {
      const h = await this.eval('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
      const w = await this.eval('window.innerWidth');
      await this.setViewport(w, Math.min(Math.ceil(h), 8000));
      params.captureBeyondViewport = true;
      await sleep(300);
    }
    const r = await this.send('Page.captureScreenshot', params);
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
    return file;
  }
  clearLogs() { this.errors.length = 0; this.failed.length = 0; this.console.length = 0; }
}

async function launch(extraArgs) {
  if (!CHROME) throw new Error('No Chrome/Edge binary found');
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* ignore */ }
  const args = [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + PROFILE, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--hide-scrollbars', '--disable-extensions',
    '--disable-background-networking', '--force-device-scale-factor=1',
    '--window-size=1440,1200'
  ].concat(extraArgs || []);
  const child = spawn(CHROME, args, { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { await getJson('http://127.0.0.1:' + PORT + '/json/version'); return child; } catch { await sleep(250); }
  }
  throw new Error('Chrome did not expose the debugging port');
}

async function page(extraArgs) {
  const child = await launch(extraArgs);
  const list = await getJson('http://127.0.0.1:' + PORT + '/json/list');
  const target = list.find((t) => t.type === 'page') || list[0];
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.setup(1440, 1200);
  cdp.kill = () => { try { child.kill(); } catch { /* ignore */ } };
  return cdp;
}

module.exports = { page, CDP, sleep, CHROME, getJson };