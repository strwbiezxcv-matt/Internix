'use strict';
/* Write ONLY verified official URLs into companies.official_website. */
const db = require('./src/db');
db.initSchema();
const VERIFIED = [
  [95,  'https://www.eastwestbanker.com/',   'Official Website'],
  [111, 'https://www.chubb.com/ph-en/',      'Official Website'],
  [124, 'https://inspirenextglobal.com/',    'Official Website'],
  [118, 'https://generalmilling.com/',       'Official Website'],
  [82,  'https://www.nimbus.com.ph/',        'Official Website (existing)'],
  [102, 'https://www.mdc.com.ph/',           'Official Website (existing)']
];
for (const [id, url, type] of VERIFIED) {
  const c = db.get('SELECT company_name, official_website, website FROM companies WHERE id = ?', id);
  if (!c) { console.log('SKIP missing id ' + id); continue; }
  const run = db.run('UPDATE companies SET official_website = ?, official_website_verified = 1 WHERE id = ?', url, id);
  console.log('UPDATED ' + id + ' | ' + c.company_name + ' | ' + url + ' | ' + type + ' | rows:' + run.changes);
}
