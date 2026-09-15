'use strict';

/**
 * InternConnect — shared security helpers.
 *
 * Small, dependency-free protections applied to every request:
 *   - security headers (CSP + hardening headers)
 *   - per-IP rate limiting (in-memory, generous limits for normal browsing)
 *   - external URL sanitisation (blocks javascript:/data: style URLs)
 *   - input clamping helpers (max lengths for user-controlled values)
 */

/* --------------------------- security headers --------------------------- */

// CSP is intentionally permissive enough for the existing app:
//  - script-src 'self'        : app.js is an external file (no inline scripts)
//  - style-src 'self' 'unsafe-inline' : the app uses inline style attributes
//  - Google Fonts (styles + font files)
//  - img-src allows https: for external company logos, data: for inline SVG
//    used by CSS-less <img> fallbacks
//  - frame-ancestors 'none'   : clickjacking protection (no framing is used)
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join('; ');

function securityHeaders(isProd) {
  const h = {
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  // HSTS only makes sense when served over HTTPS (Vercel production).
  if (isProd) h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

/* ------------------------------ rate limit ------------------------------ */

/**
 * Fixed-window in-memory rate limiter, keyed by client IP.
 * Designed to stop abusive scripted hammering while never blocking a normal
 * student who is searching, filtering and browsing. State resets on process
 * restart (fine for a stateless discovery API and for serverless cold starts).
 */
function rateLimiter({ windowMs = 60000, max = 300 } = {}) {
  const hits = new Map();
  let lastSweep = Date.now();
  return function check(key) {
    const now = Date.now();
    // Periodically evict stale buckets so the map cannot grow unbounded.
    if (now - lastSweep > windowMs) {
      lastSweep = now;
      for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    }
    let b = hits.get(key);
    if (!b || now > b.reset) {
      b = { count: 0, reset: now + windowMs };
      hits.set(key, b);
    }
    b.count += 1;
    return { limited: b.count > max, remaining: Math.max(0, max - b.count) };
  };
}

function clientIp(req) {
  // Vercel forwards the real client IP; localhost falls back to a loopback id.
  const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/* ----------------------------- URL sanitiser ----------------------------- */

/**
 * Allow only http(s) (and optionally mailto:) URLs in data returned by the
 * API. Anything with a dangerous scheme (javascript:, data:, vbscript:, ...)
 * is replaced with null so it can never be rendered as a link or image src.
 */
function safeExternalUrl(u, { allowMailto = false } = {}) {
  if (typeof u !== 'string') return null;
  const s = u.trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith('https://') || lower.startsWith('http://')) return s;
  if (allowMailto && lower.startsWith('mailto:')) return s;
  return null;
}

/* --------------------------- input validation ---------------------------- */

/** Coerce any value to a bounded, trimmed string (defence against oversized input). */
function boundedString(v, maxLen = 200) {
  if (v == null) return '';
  let s = String(v);
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s.trim();
}

/** Strict positive-integer ID parsing (rejects NaN, floats, huge values). */
function parseId(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) return null;
  return n;
}

module.exports = {
  securityHeaders,
  rateLimiter,
  clientIp,
  safeExternalUrl,
  boundedString,
  parseId
};
