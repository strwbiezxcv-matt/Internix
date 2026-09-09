'use strict';
const db = require('../src/db');
const loaders = require('../src/loaders');
const matching = require('../src/matching');

const demoCompanies = db.all("SELECT company_name FROM companies WHERE verification_status != 'verified'");
const demoOpps = db.all("SELECT position FROM internship_opportunities WHERE verification_status != 'verified'");
const sampleCompanies = db.all("SELECT company_name FROM companies WHERE company_name LIKE '%Sample%' OR company_name LIKE '%Demo%' OR company_name LIKE '%Tech Services%'");
const sampleOpps = db.all("SELECT position FROM internship_opportunities WHERE position LIKE '%Demo%' OR position LIKE '%Sample%'");

console.log('DEMO companies        :', JSON.stringify(demoCompanies));
console.log('NON-verified opps     :', JSON.stringify(demoOpps));
console.log('Sample/demo companies :', JSON.stringify(sampleCompanies));
console.log('Sample/demo opps      :', JSON.stringify(sampleOpps));

const profile = {
  name: 'T',
  program: 'COMPUTER ENGINEERING',
  specialization: '',
  skills: ['HTML', 'CSS', 'JavaScript', 'Git', 'Web Development'],
  preferred_field: 'Web Development',
  preferred_location: 'Bulacan',
  work_arrangement: 'On-site'
};
const all = loaders.loadAllOpenOpportunities();
console.log('Open opportunities    :', all.length);
for (const o of all) {
  const m1 = matching.computeMatch(profile, o);
  const a = m1.score;
  const b = matching.computeMatch(profile, o).score;
  const c = matching.computeMatch(profile, o).score;
  const br = m1.breakdown;
  const manual = Math.round(
    ((br.course * 0.25) + (br.specialization * 0.15) + (br.skills * 0.30) +
     (br.field * 0.15) + (br.location * 0.10) + (br.arrangement * 0.05)) * 100
  );
  console.log(' ' + o.company_name + ' / ' + o.position + ' -> ' + a + '% determinism=' + (a === b && b === c) + ' formula=' + (a === manual) + ' breakdown=' + JSON.stringify(br) + ' manual=' + manual);
}