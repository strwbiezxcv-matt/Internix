'use strict';

/**
 * InternConnect — HTTP server (long-running Node entry point).
 *
 * Used for localhost (`npm start`) and any traditional Node host. The shared
 * application core lives in src/app.js; the same core is also exposed to
 * Vercel via api/index.js so production serves real API data.
 */

const config = require('./config');
const { createServer } = require('./app');

const server = createServer();

server.listen(config.port, () => {
  console.log('==============================================');
  console.log('  Internix is running');
  console.log(`  -> http://localhost:${config.port}`);
  console.log('  Open the URL in your browser to find internship matches.');
  console.log('  No login or account required.');
  console.log('==============================================');
});
