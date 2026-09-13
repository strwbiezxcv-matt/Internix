'use strict';

/**
 * InternConnect — application core.
 *
 * Zero-dependency request handler using only built-in modules. Shared by:
 *   - src/server.js  (long-running Node server for localhost / traditional hosts)
 *   - api/index.js   (Vercel serverless function for production)
 *
 * Serves the static front end and exposes a JSON API. Sessions are cookie-based.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const config = require('./config');
const db = require('./db');
const { Router } = require('./router');
const { ok, fail, readJsonBody, parseQuery } = require('./util');

const catalogRoutes = require('./routes/catalogRoutes');
const opportunityRoutes = require('./routes/opportunityRoutes');
const matchRoutes = require('./routes/matchRoutes');

/* ----------------------------- bootstrap ----------------------------- */


/* ------------------------------- router ------------------------------- */

const router = new Router();

// Public routes only — InternConnect is a discovery/matching platform.
// No login, no accounts, no authentication required.
catalogRoutes.register(router);
opportunityRoutes.register(router);
matchRoutes.register(router);

// Authentication & account-based routes are intentionally disabled:
//   authRoutes, studentRoutes, companyRoutes
// Students use the platform anonymously; companies are curated seed data.

/* --------------------------- static serving --------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

function serveStatic(urlPath, res) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(config.publicDir, rel));
  if (!filePath.startsWith(config.publicDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for client-side routes
      fs.readFile(path.join(config.publicDir, 'index.html'), (err2, indexData) => {
        if (err2) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ----------------------------- request loop ----------------------------- */

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;
  const method = req.method;

  if (!pathname.startsWith('/api')) {
    serveStatic(pathname, res);
    return;
  }

  let body = {};
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    try {
      body = await readJsonBody(req);
    } catch {
      return fail(res, 'Invalid JSON body.', 400);
    }
  }

  const match = router.match(method, pathname);
  if (!match) return fail(res, 'Not found.', 404);

  const ctx = {
    req,
    res,
    params: match.params,
    query: parseQuery(url.search.slice(1)),
    body
  };

  try {
    await match.handler(ctx);
  } catch (err) {
    console.error('[error]', method, pathname, err);
    if (!res.headersSent) fail(res, 'Internal server error.', 500);
  }
}

function createServer() {
  return http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.error('[fatal]', err);
      if (!res.headersSent) fail(res, 'Internal server error.', 500);
    });
  });
}

module.exports = { handleRequest, createServer };

db.initSchema();

const programCount = db.get('SELECT COUNT(*) AS c FROM programs').c;
if (programCount === 0 && config.seedData) {
  const { seedAll } = require('./seed');
  seedAll();
}
