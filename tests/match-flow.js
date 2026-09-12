'use strict';
/* Full matching-flow test: all 10 programs, single + multi, locations. */
const BASE = 'http://localhost:3000';
async function j(method, path, body) {
  const res = await fetch(BASE + path, body !== undefined
    ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method });
  const json = await res.json();
  if (!res.ok || json.ok === false) throw new Error(json.error || res.status);
  return json.data;
}
const g = (n) => ' '.repeat(Math.max(0, 48 - n.length));

async function main() {
  const cat = await j('GET', '/api/catalog');
  const options = cat.program_options;
  console.log('program_options:', options.length);
  console.log(options.map((o) => '  ' + o.value + ' = ' + o.label).join('\n'));
  console.log('locations:', JSON.stringify(cat.locations));
  const companies = await j('GET', '/api/companies');
  const opps = await j('GET', '/api/opportunities');
  console.log('companies:', companies.length, '| open opportunities:', opps.length);
  const codeOf = (labelPart) => (options.find((o) => o.label.toLowerCase().includes(labelPart.toLowerCase())) || {}).value;

  console.log('\n===== SINGLE PROGRAM (no location) =====');
  for (const o of options) {
    const d = await j('POST', '/api/match', { programs: [o.value], location: null });
    const top = d.results[0];
    console.log(o.label + g(o.label) + ' -> ' + d.results.length + ' results | top: ' +
      (top ? top.opportunity.position + ' @ ' + top.opportunity.company_name + ' ' + top.match.score + '% accepted=' + (top.opportunity.program_names || []).join('/') : '-'));
  }
  console.log('\n===== SINGLE PROGRAM + LOCATIONS (IT) =====');
  const it = codeOf('Information Technology');
  for (const loc of ['Bulacan', 'Metro Manila', 'Santa Maria, Bulacan', 'Malolos, Bulacan', 'Quezon City', 'Makati']) {
    const d = await j('POST', '/api/match', { programs: [it], location: loc });
    const locs = [...new Set(d.results.slice(0, 10).map((r) => r.opportunity.location))];
    console.log(('IT + ' + loc) + g('IT + ' + loc) + ' -> ' + d.results.length + ' | sample locs: ' + locs.slice(0, 5).join('; '));
  }
  console.log('\n===== MULTI-PROGRAM =====');
  const combos = [
    [codeOf('Information Technology'), codeOf('Computer Engineering')],
    [codeOf('Business Administration'), codeOf('Entrepreneurship')],
    [codeOf('Industrial Engineering'), codeOf('Computer Engineering')],
    [codeOf('Food Technology'), codeOf('Electrical Technology')]
  ];
  for (const combo of combos) {
    const d = await j('POST', '/api/match', { programs: combo, location: 'Bulacan' });
    const labels = combo.map((c) => (options.find((o) => o.value === c) || {}).label || c);
    const both = d.results.filter((r) => (r.match.program.matches || []).length > 1).length;
    const top = d.results[0];
    console.log(labels.join(' + ') + g(labels.join(' + ')) + ' -> ' + d.results.length + ' results (match-both: ' + both + ') | top: ' +
      (top ? top.opportunity.position + ' ' + top.match.score + '%' : '-'));
  }
  console.log('\n===== COMPANIES DIRECTORY FILTERS =====');
  for (const prov of ['Bulacan', 'Metro Manila']) {
    const list = await j('GET', '/api/companies?province=' + encodeURIComponent(prov));
    console.log(prov + ':', list.length, 'companies');
  }
  const sm = await j('GET', '/api/opportunities?location=' + encodeURIComponent('Santa Maria, Bulacan'));
  console.log('opps in Santa Maria:', sm.length, '->', sm.map((o) => o.location).join('; '));
  const search = await j('GET', '/api/opportunities?q=' + encodeURIComponent('software') + '&location=' + encodeURIComponent('Bulacan'));
  console.log("search 'software' + Bulacan:", search.length, '->', search.slice(0, 5).map((o) => o.position).join('; '));
  console.log('\nALL API TESTS PASSED');
}
main().catch((e) => { console.error('TEST FAILED:', e.message); process.exit(1); });
