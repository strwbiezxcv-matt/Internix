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
const {
  securityHeaders, rateLimiter, clientIp, boundedString, parseId
} = require('./security');

const isProd = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
const HEADERS = securityHeaders(isProd);

// Generous limits: a student searching/filtering/browsing will never hit
// these; they only stop abusive scripted hammering of the public API.
const apiLimiter = rateLimiter({ windowMs: 60000, max: 300 });
const matchLimiter = rateLimiter({ windowMs: 60000, max: 60 });

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
  // Path traversal guard: the resolved path must stay INSIDE public/ — check
  // the separator too so sibling directories (e.g. ".../public-evil") fail.
  const withSep = config.publicDir.endsWith(path.sep)
    ? config.publicDir
    : config.publicDir + path.sep;
  if (filePath !== config.publicDir && !filePath.startsWith(withSep)) {
    res.writeHead(403, HEADERS); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for client-side routes
      fs.readFile(path.join(config.publicDir, 'index.html'), (err2, indexData) => {
        if (err2) { res.writeHead(404, HEADERS); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], ...HEADERS });
        res.end(indexData);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...HEADERS });
    res.end(data);
  });
}

/* ----------------------------- request loop ----------------------------- */

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;

  // Reject path traversal / null bytes before anything else. `new URL()`
  // already decodes %2e-style escapes, so a plain '..' check covers them.
  if (pathname.includes('..') || pathname.includes('\x00')) {
    res.writeHead(400, HEADERS); res.end('Bad request'); return;
  }

  if (!pathname.startsWith('/api')) {
    serveStatic(pathname, res);
    return;
  }

  /* ------------------------- API hardening ------------------------- */
  // Security headers apply to API responses too (writeHead merges with these).
  for (const [k, v] of Object.entries(HEADERS)) res.setHeader(k, v);
  // Per-IP rate limiting (generous; see src/security.js).
  const limit = pathname === '/api/match'
    ? matchLimiter(clientIp(req))
    : apiLimiter(clientIp(req));
  if (limit.limited) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8', ...HEADERS });
    res.end(JSON.stringify({ ok: false, error: 'Too many requests. Please slow down and try again shortly.' }));
    return;
  }

  // Sanitise query parameters server-side: bounded count, key and value
  // lengths. Malicious or oversized inputs are clamped, never trusted.
  const rawQuery = parseQuery(url.search.slice(1));
  const query = {};
  const keys = Object.keys(rawQuery).slice(0, 30);
  for (const k of keys) {
    const v = rawQuery[k];
    query[boundedString(k, 64)] = Array.isArray(v)
      ? v.slice(0, 10).map((x) => boundedString(x, 300))
      : boundedString(v, 300);
  }

  let body = {};
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    try {
      body = await readJsonBody(req);
    } catch {
      return fail(res, 'Invalid JSON body.', 400);
    }
  }

  const match = router.match(req.method, pathname);
  if (!match) {
    // Distinguish "wrong method on an existing path" from "unknown path".
    const others = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']
      .filter((m) => m !== req.method && router.match(m, pathname));
    const status = others.length ? 405 : 404;
    if (others.length) res.setHeader('Allow', others.join(', '));
    return fail(res, status === 405 ? 'Method not allowed.' : 'Not found.', status);
  }

  const ctx = {
    req,
    res,
    params: match.params,
    query,
    body
  };

  try {
    await match.handler(ctx);
  } catch (err) {
    // Full details stay in server logs only; the client gets a generic message.
    console.error('[error]', req.method, pathname, err);
    if (!res.headersSent) fail(res, 'Something went wrong. Please try again.', 500);
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
