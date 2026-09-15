import os

P = 'tests/browser-test.js'
open(P, 'w').close()

def w(s):
    with open(P, 'a', encoding='utf-8') as f:
        f.write(s)

w("""'use strict';
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CHROME = 'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe';
const CDP_PORT = 9223;
const APP = 'http://localhost:3000';
const WebSocket = globalThis.WebSocket;

const results = [];
const log = (name, pass, info) => { results.push(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info || ''}`); console.log(results[results.length - 1]); };
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
""")
print('chunk1')
