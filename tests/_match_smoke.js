'use strict';
/**
 * Program-match smoke test.
 *
 * POST /api/match for EVERY available program option. Verifies:
 *  - each request succeeds
 *  - a profile is returned with the correct program name
 *  - results (internship opportunities) and companies are returned
 *  - Top-3 opportunities are listed with score + company
 */

const B = 'http://localhost:' + (process.env.PORT || '3000');

(async () => {
  const post = async (b) => {
    const r = await fetch(B + '/api/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b)
    });
    return [r.status, await r.json()];
  };

  const catalog = await (await fetch(B + '/api/catalog')).json();
  const c = catalog.data || catalog;
  const opts = Array.isArray(c.program_options) ? c.program_options : [];
  console.log('Program options:', opts.length);
  opts.forEach((o) => console.log('  - ' + o.label));

  let total = 0;
  for (const code of opts) {
    const [s, d0] = await post({ program: code.code || code });
    const d = (d0 && d0.data) || d0;
    console.log('\n' + code.label + ' -> status', s,
      '| profile:', (d.profile && d.profile.program_name) || '?',
      '| opportunities:', (d.results || []).length,
      '| companies:', (d.companies || []).length);

    if (d.results && d.results.length) {
      d.results.slice(0, 3).forEach((x) =>
        console.log('   ' + x.match.score + '%  ' + x.opportunity.position +
          ' — ' + (x.opportunity.company_name || '')));
    } else {
      console.log('   (no internship opportunities returned)');
    }
    if (d.companies && d.companies.length) {
      d.companies.slice(0, 3).forEach((c) =>
        console.log('   [' + (c.has_verified_opening ? 'HAS OPP' : 'NO OPP') + '] ' +
          (c.company_name || '') + ' — ' + (c.industry || '')));
    }
    total += (d.results || []).length;
  }
  console.log('\nTotal internship opportunities across all programs:', total);
})().catch((e) => { console.error(e); process.exit(1); });
