'use strict';

/**
 * InternConnect authentication.
 *
 * - Passwords are hashed with scrypt (via Node's built-in crypto) plus a
 *   per-user random salt. Plain-text passwords are never stored.
 * - Sessions use opaque random tokens. Only a SHA-256 hash of the token is
 *   stored in the database, so a leaked database cannot be replayed.
 * - Row-level ownership is enforced at the route layer: students only manage
 *   their own profile / saved items / applications, companies only their own
 *   opportunities.
 */

const crypto = require('node:crypto');
const config = require('./config');
const { run, get, all, lastInsertId } = require('./db');

const SESSION_TTL_DAYS = 14;

/* ----------------------------- password ----------------------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 32, {
    N: 1 << 14,
    r: 8,
    p: 1
  });
  return {
    salt: salt.toString('hex'),
    hash: derived.toString('hex')
  };
}

function verifyPassword(password, storedHash, storedSalt) {
  try {
    const salt = Buffer.from(storedSalt, 'hex');
    const derived = crypto.scryptSync(password, salt, 32, {
      N: 1 << 14,
      r: 8,
      p: 1
    });
    const a = Buffer.from(storedHash, 'hex');
    const b = derived;
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verify a password against a stored "salt:hash" combined value.
 */
function verifyStoredPassword(password, stored) {
  if (!stored) return false;
  const idx = stored.indexOf(':');
  if (idx < 1) return false;
  return verifyPassword(password, stored.slice(idx + 1), stored.slice(0, idx));
}

/* ----------------------------- sessions ----------------------------- */

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000)
    .toISOString();
  run(
    'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    tokenHash,
    userId,
    expiresAt
  );
  return {
    token,
    tokenHash,
    expiresAt
  };
}

function destroySession(tokenHash) {
  run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
}

/**
 * Resolve a raw cookie token to the active user row (joined with student /
 * company), or null if invalid / expired.
 */
function resolveSession(rawToken) {
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const session = get(
    `SELECT s.user_id, s.expires_at FROM sessions s WHERE s.token_hash = ?`,
    tokenHash
  );
  if (!session) return null;
  if (new Date(session.expires_at) < new Date()) {
    destroySession(tokenHash);
    return null;
  }
  return getUser(session.user_id);
}

function getUser(userId) {
  const user = get('SELECT * FROM users WHERE id = ?', userId);
  if (!user) return null;
  user.student = get('SELECT * FROM students WHERE user_id = ?', userId);
  user.company = get('SELECT * FROM companies WHERE user_id = ?', userId);
  return user;
}

/* ----------------------------- cookie ----------------------------- */

const COOKIE_NAME = 'ic_session';

function signCookie(token) {
  const hmac = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(token)
    .digest('hex');
  return `${token}.${hmac}`;
}

function verifyCookieValue(value) {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const token = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  const expected = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(token)
    .digest('hex');
  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    return null;
  }
  return token;
}

function setSessionCookie(res, token) {
  // Secure flag should be enabled behind HTTPS; disabled by default locally.
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${signCookie(token)}; Path=/; HttpOnly; Max-Age=${SESSION_TTL_DAYS * 86400}; SameSite=Lax${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

function readSessionCookie(req) {
  const header = req.headers['cookie'] || '';
  const match = header.split(';').map((s) => s.trim()).find((c) => c.startsWith(COOKIE_NAME + '='));
  if (!match) return null;
  return verifyCookieValue(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
}

module.exports = {
  hashPassword,
  verifyStoredPassword,
  verifyPassword,
  createSession,
  destroySession,
  resolveSession,
  getUser,
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  hashToken
};