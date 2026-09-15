# Internix — Security Audit & Hardening Report

**Date:** 2026-09-15 · **Scope:** Full-project OWASP-aligned audit (localhost Node server + Vercel serverless production). No data deleted, no features removed, no UI redesigned, no authentication/cookies added.

## 1. Architecture (as found)

Frontend (public/app.js, vanilla JS SPA + localStorage "Saved") → same-origin fetch → API (src/routes: catalog, companies, opportunities, match) → src/app.js shared handler → src/server.js (localhost) / api/index.js (Vercel) → SQLite via node:sqlite + loaders (151 companies, 61 opportunities, 11 programs).

- Sessions/auth code (src/auth.js, authRoutes, studentRoutes, companyRoutes) is intentionally disabled — the app is a public discovery platform. Left as-is.
- "Saved" is localStorage-only (`internix.savedCompanies`, numeric IDs) — appropriate for a non-authenticated design. Left as-is.

## 2. Vulnerabilities Found & Fixes

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | No security headers (no CSP, no clickjacking protection, no nosniff) | Medium | CSP + X-Frame-Options: DENY + X-Content-Type-Options + Referrer-Policy + Permissions-Policy + COOP on every response in code; HSTS + full header set in vercel.json. CSP tuned: script-src 'self'; style-src 'self' 'unsafe-inline' (inline style attrs used); Google Fonts allowed; img-src 'self' data: https: (external logos); frame-ancestors 'none' |
| 2 | Incomplete path traversal guard in static serving (startsWith(publicDir) passes for sibling dirs) | Medium | Resolved-path check with path.sep + '..'/null-byte rejection in handleRequest |
| 3 | No rate limiting on public API | Medium | In-memory fixed-window per-IP limiter: 300 req/min API-wide, 60 req/min /api/match; IP from x-forwarded-for (Vercel) / socket. Generous — normal browsing never blocked |
| 4 | Unbounded user-controlled query/body values | Medium | Server-side clamping in src/app.js (≤30 params, ≤64-char keys, ≤300-char values) and matchRoutes (search ≤300, program names ≤120, ≤20 programs). Legitimate names/locations unaffected |
| 5 | Non-integer IDs reach the DB layer (parseInt NaN) | Low | Strict parseId() → clean 404s |
| 6 | DB URL fields rendered without scheme validation | Low | sanitizeUrls() on every company/opportunity leaving the API (http/https only); client-side isHttp() guards on logo img, Website link, source link. rel="noopener noreferrer" preserved everywhere |
| 7 | 404 returned for wrong-method requests | Info | Correct 405 with Allow header; real 404s unchanged |
| 8 | Technical 500 message | Info | Now "Something went wrong. Please try again." Full stack logged server-side only |

### Verified-secure (no change needed)
- **SQL injection:** every query uses prepared/parameterized statements via node:sqlite; filters applied in JS after loading, never concatenated.
- **XSS:** frontend consistently escapes dynamic data with esc(); no eval/document.write; new CSP adds a second layer.
- **CORS:** no Access-Control-Allow-Origin anywhere — same-origin only. Correct; nothing added.
- **Secrets:** .env gitignored and untracked; only a local dev value; no secrets in frontend JS; serverless 500 handler exposes no internals.
- **Dependencies:** npm audit → 0 vulnerabilities; zero external runtime deps. No upgrades needed.
- **Data exposure:** company detail SELECT enumerates only public columns; match responses return only fields the UI uses.


## 3. Functionality & Security Test Results (live, localhost, non-destructive)

| Test | Result |
|------|--------|
| npm audit (prod deps) | PASS — 0 vulnerabilities |
| npm run build | PASS — BUILD SUCCEEDED |
| npm start → localhost:3000 | PASS — /, /api/catalog, /api/companies, /api/opportunities all 200 |
| Data integrity | PASS — 151 companies, 11 programs, 61 opportunities intact |
| Home (program dropdown, location, CTAs) | PASS |
| Companies (search, filter, detail, URL fields safe) | PASS |
| Find My Matches (POST /api/match, code BSBA → 200, 7 results, 21 related companies; Metro Manila + search → 11) | PASS |
| Internship Opportunities (search/filter/detail) | PASS |
| Saved (localStorage logic untouched) | PASS |
| Static assets /, /app.js, /styles.css, /branding.png | PASS — all 200 with CSP headers |
| XSS payload in URL path (/api/companies/%3Cscript%3E) | PASS — 404, no reflection |
| javascript: URL smuggling via DB fields | PASS — API output scanned, urls safe |
| SQLi-style filter (Bulacan' OR 1=1--) | PASS — harmless empty result |
| Float ID 1.5 / script-tag ID | PASS — 404 |
| 5000-char search string | PASS — clamped, 200 |
| Oversized/invalid match body (100 programs, 10k search) | PASS — clean 400 |
| Malformed JSON body | PASS — 400 |
| Path traversal ..%2f.env / backslash | PASS — 400 / index fallback, no file leak |
| Wrong method (POST /api/catalog) | PASS — 405 with Allow: GET, HEAD |
| HEAD /api/catalog | PASS — 200 |
| Rate limit burst (320 rapid requests) | PASS — 429s triggered; static assets unaffected |
| Browser console / JS errors | PASS — CSP verified compatible |

## 4. Files Changed

| File | Why |
|------|-----|
| src/security.js (new) | Shared hardening module: security headers, per-IP rate limiter, safeExternalUrl(), boundedString(), parseId() |
| src/app.js | Security headers on all responses; hardened path traversal guard; '..'/null-byte rejection; query clamping; rate limiting; 405 handling; safer 500 message |
| src/loaders.js | sanitizeUrls() on every company/opportunity object leaving the API |
| src/routes/opportunityRoutes.js | Strict integer ID validation for detail endpoints |
| src/routes/matchRoutes.js | Server-side clamping of search, location, program list |
| public/app.js | Client-side isHttp() guards on logo images, Website link, source link (defense-in-depth; UI unchanged) |
| vercel.json | Production security headers incl. HSTS + CSP; rewrites untouched |

## 5. Remaining Risks (honest assessment)

1. **In-memory rate limiter resets per cold start / serverless instance.** Distributed abuse needs a shared store (Upstash/KV) or Vercel platform DDoS protection. Not added to avoid new dependencies/costs.
2. **No authentication by design.** The public API is readable by anyone (public directory — by design). Rate limiting mitigates bulk scraping but cannot prevent it.
3. **CSP allows img-src https:** logos come from external official sites; only images can load — scripts stay blocked.
4. **Legacy auth/session code (src/auth.js, disabled routes) still exists** with a fallback dev SESSION_SECRET. Unreachable (routes never registered), but if you re-enable auth: set a strong SESSION_SECRET in Vercel and COOKIE_SECURE=1. Consider deleting dead auth code later.
5. **HSTS enforced in vercel.json only**; localhost intentionally stays HTTP (preserving local functionality).
6. **Repo hygiene (non-security):** leftover temp files (_tmp_*.txt, *.log, public/app.js.orig) contain no secrets; not deleted per your instructions. Recommend cleanup + gitignore patterns (_*.txt, *.log).

Nothing was removed: no data, no companies (151), no programs (11), no opportunities (61), no matching logic, no location filtering, no UI changes.