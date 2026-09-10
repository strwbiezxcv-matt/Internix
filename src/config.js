'use strict';

/**
 * InternConnect configuration loader.
 *
 * Reads configuration from environment variables with sensible development
 * defaults. Secrets live in `.env` (loaded below) and are never hardcoded into
 * application source code.
 *
 * In production you would replace the simple parser below with your hosting
 * platform's secrets manager — credentials are still referenced by name only.
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

/**
 * Minimal `.env` reader. Does not overwrite variables that already exist in
 * the process environment, so real deployment secrets always take precedence.
 */
function loadDotEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function intFromEnv(name, fallback) {
  const parsed = parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: intFromEnv('PORT', 3000),
  sessionSecret: process.env.SESSION_SECRET || 'internconnect-insecure-local-secret',
  dbPath: path.resolve(ROOT, process.env.DB_PATH || './data/internconnect.db'),
  seedData: !['0', 'false', 'no'].includes((process.env.SEED_DATA || process.env.SEED_DEMO_DATA || '1').toLowerCase()),
  root: ROOT,
  publicDir: path.join(ROOT, 'public')
};

module.exports = config;