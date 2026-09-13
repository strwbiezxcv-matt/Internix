'use strict';

/**
 * Vercel serverless entry point for the Internix API.
 *
 * Vercel's Node runtime provides standard Node.js req/res objects, so the
 * exact same request handler used by src/server.js (localhost) handles every
 * /api/* request in production. The Vercel rewrite in vercel.json forwards
 * /api/(.*) here while preserving the original request URL, so routes like
 * /api/catalog, /api/companies and /api/opportunities work unchanged.
 *
 * Database bootstrap is handled by src/config.js:
 *   - the deployment bundle (/var/task) is read-only, so the SQLite file is
 *     relocated to /tmp;
 *   - the bundled snapshot data/internconnect.db is copied there on cold
 *     start (all companies/programs/opportunities preserved);
 *   - if no snapshot exists, the full idempotent seed runs instead.
 */

const { handleRequest } = require('../src/app');

module.exports = async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('[fatal]', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Internal server error.' }));
    }
  }
};
