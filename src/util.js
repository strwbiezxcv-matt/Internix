'use strict';

/**
 * Small shared HTTP / serialization helpers.
 */

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function ok(res, data, status = 200) {
  json(res, status, { ok: true, data });
}

function fail(res, message, status = 400, extra = {}) {
  json(res, status, { ok: false, error: message, ...extra });
}

async function readJsonBody(req, maxBytes = 512 * 1024) {
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
}

function parseQuery(raw) {
  const out = {};
  if (!raw) return out;
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    // URLSearchParams / application/x-www-form-urlencoded encodes spaces as '+'.
    // decodeURIComponent alone does NOT turn '+' into a space, so we must replace
    // it first. Without this, 'Metro+Manila' never matches 'Metro Manila' and
    // location/province filters silently return 0 results.
    const key = decodeURIComponent((eq > -1 ? part.slice(0, eq) : part).replace(/\+/g, ' '));
    const value = eq > -1 ? decodeURIComponent(part.slice(eq + 1).replace(/\+/g, ' ')) : '';
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = Array.isArray(out[key]) ? out[key] : [out[key]];
      out[key].push(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function softError(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

function pastDeadline(deadline) {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return false;
  return d < new Date();
}

module.exports = { ok, fail, readJsonBody, parseQuery, json, softError, pastDeadline };