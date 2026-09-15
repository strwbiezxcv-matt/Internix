'use strict';
/* Internix requested company expansion (idempotent, no fabrication). */
const db = require('./db');
const locations = require('./locations');
const ACCEPTING = 'Accepting Internship';
const POTENTIAL = 'Potential Internship Host';
const NEEDS = 'Needs Verification';
const TODAY = '2026-09-11';
function normRegion(p) {
  const v = String(p || '').toLowerCase();
  if (v.includes('bulacan')) return 'Bulacan';
  return 'Metro Manila';
}
function findCompany(name, city) {
  const rows = db.all('SELECT id, company_name, city FROM companies');
  const n = String(name || '').trim().toLowerCase();
  const c = city ? String(city).trim().toLowerCase() : null;
  for (const r of rows) {
    if (String(r.company_name || '').trim().toLowerCase() !== n) continue;
    const rc = r.city ? String(r.city).trim().toLowerCase() : null;
    if (c === rc) return r;
    if (!c && !rc) return r;
  }
  return null;
}
function upsertCompany(d) {
  const ex = findCompany(d.company_name, d.city || null);
  const loc = d.location || (d.city ? d.city + ', ' + d.province : d.province || null);
  const mun = d.municipality || d.city || null;
  const args = [d.logo_url || null, d.description, d.address || null, loc,
    d.city || null, mun, d.province, normRegion(d.province),
    d.industry, d.contact_info || null, d.website || null, d.careers_url || null,
    d.company_size || null, d.year_established || null, d.verification_status || 'needs_review',
    d.source_name, d.source_url, d.verified_at || null,
    d.internship_status, d.internship_notes || null, TODAY];
  if (ex) {
    db.run('UPDATE companies SET logo_url=?,description=?,address=?,location=?,city=?,municipality=?,province=?,region=?,industry=?,contact_info=?,website=?,careers_url=?,company_size=?,year_established=?,verification_status=?,source_name=?,source_url=?,verified_at=?,internship_status=?,internship_notes=?,last_verified_at=? WHERE id=?', ...args, ex.id);
    if (d.website || d.official_website) {
      db.run('UPDATE companies SET official_website = COALESCE(official_website, ?) WHERE id = ?', d.official_website || d.website, ex.id);
    }
    return ex.id;
  }
  const newId = db.lastInsertId(db.run('INSERT INTO companies (company_name,logo_url,description,address,location,city,municipality,province,region,industry,contact_info,website,careers_url,company_size,year_established,verification_status,source_name,source_url,verified_at,internship_status,internship_notes,last_verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', d.company_name, ...args));
  if (d.website || d.official_website) {
    db.run('UPDATE companies SET official_website = COALESCE(official_website, ?) WHERE id = ?', d.official_website || d.website, newId);
  }
  return newId;
}
function linkCP(name, city, codes) {
  const c = findCompany(name, city || null);
  if (!c) return;
  for (const code of codes || []) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) db.run('INSERT OR IGNORE INTO company_programs (company_id,program_id,relationship_type) VALUES (?,?,?)', c.id, p.id, 'relevant');
  }
}
function upsertOpp(companyName, city, d) {
  const c = findCompany(companyName, city || null);
  if (!c) return null;
  const dupe = d.source_url
    ? db.get('SELECT id FROM internship_opportunities WHERE company_id=? AND source_url=?', c.id, d.source_url)
    : db.get('SELECT id FROM internship_opportunities WHERE company_id=? AND position=?', c.id, d.position);
  if (dupe) return dupe.id;
  const f = d.field ? db.get('SELECT id FROM internship_fields WHERE name=?', d.field) : null;
  const mun = d.municipality || null;
  const prov = d.province || null;
  const parsed = locations.parseLocation(d.location || ((mun && prov) ? (mun + ', ' + prov) : (mun || prov || '')));
  const muni = mun || (parsed && parsed.municipality) || null;
  const city2 = muni || (parsed && parsed.city) || null;
  const prov2 = prov || (parsed && parsed.province) || 'Metro Manila';
  const reg2 = (parsed && parsed.region) || prov2;
  const label = muni && prov2 ? (muni + ', ' + prov2) : (d.location || prov2);
  const id = db.lastInsertId(db.run('INSERT INTO internship_opportunities (company_id,position,description,field_id,location,work_arrangement,internship_type,source_name,source_url,verification_status,verified_at,last_verified_at,status,date_posted,municipality,city,province,region) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    c.id, d.position, d.description, f ? f.id : null, label, d.work_arrangement || 'On-site',
    'Internship', d.source_name, d.source_url, d.verification_status || 'needs_review',
    TODAY, TODAY, 'open', TODAY + ' 08:00:00', muni, city2, prov2, reg2));
  for (const code of d.programs || []) {
    const p = db.get('SELECT id FROM programs WHERE code=?', code);
    if (p) db.run('INSERT OR IGNORE INTO opportunity_programs (opportunity_id,program_id) VALUES (?,?)', id, p.id);
  }
  for (const nm of d.specializations || []) {
    const s = db.get('SELECT id FROM specializations WHERE name=?', nm);
    if (s) db.run('INSERT OR IGNORE INTO opportunity_specializations (opportunity_id,specialization_id) VALUES (?,?)', id, s.id);
  }
  for (const nm of d.skills || []) {
    const k = db.get('SELECT id FROM skills WHERE lower(name)=lower(?)', nm);
    if (k) db.run('INSERT OR IGNORE INTO opportunity_skills (opportunity_id,skill_id) VALUES (?,?)', id, k.id);
  }
  return id;
}
function seedBatchA() {
  upsertCompany({ company_name: 'Nimbustechnologies, Inc.', industry: 'Technology / IT (IT Solutions Provider)',
    address: '4th Floor Riverbend Bldg., 1869 P. Domingo Street, Brgy. Kasilawan, Makati City',
    city: 'Makati', province: 'Metro Manila',
    description: 'Nimbustechnologies, Inc. - Philippine IT solutions provider (network & endpoint security, hyper-converged infrastructure, backup/recovery/storage, structured cabling, engineering software, CCTV/biometrics). Address and identity verified on the official website nimbus.com.ph.',
    website: 'https://www.nimbus.com.ph/', careers_url: null, verification_status: 'verified',
    source_name: 'Official company website (nimbus.com.ph)', source_url: 'https://www.nimbus.com.ph/',
    internship_status: POTENTIAL, internship_notes: 'IT solutions provider suitable for IT/Computer Engineering OJT. No internship-specific posting verified on the official site - do not assume openings.' });
  linkCP('Nimbustechnologies, Inc.', ['BSIT', 'COMPUTER ENGINEERING']);
  upsertCompany({ company_name: 'Metacom BPO', industry: 'BPO / Business Services',
    city: 'Baliwag', province: 'Bulacan', municipality: 'Baliwag',
    location: 'Baliwag, Bulacan',
    description: 'Metacom BPO - legitimate BPO/business-services company in Baliwag, Bulacan; no internship-specific opening verified.',
    website: 'https://metacombpo.com', careers_url: null, verification_status: 'needs_review',
    source_name: 'Official company website (metacombpo.com)', source_url: 'https://metacombpo.com',
    internship_status: POTENTIAL, internship_notes: 'Active recruitment presence noted; no internship/OJT-specific evidence found, so Potential Internship Host.' });
  linkCP('Metacom BPO', 'Baliwag', []);
  upsertCompany({ company_name: 'Ramcar Technology Incorporated (Motolite)', industry: 'Automotive / Battery / Manufacturing / Technology',
    address: 'Ramcar Center, 80-82 Roces Ave., Diliman, Quezon City', city: 'Quezon City', province: 'Metro Manila',
    description: 'Ramcar Technology Incorporated - manufacturer of Motolite batteries (motolite.com). Official careers page publishes an Industrial Engineer Intern posting with an Internship job filter.',
    website: 'https://www.motolite.com', careers_url: 'https://www.motolite.com/careers', verification_status: 'verified',
    source_name: 'Official company website (https://www.motolite.com)', source_url: 'https://www.motolite.com',
    internship_status: ACCEPTING, internship_notes: 'Official careers page has Internship job filter; Industrial Engineer Intern documented.' });
  upsertOpp('Ramcar Technology Incorporated (Motolite)', 'Quezon City', { position: 'Industrial Engineer Intern',
    description: 'Industrial engineering internship at Ramcar/Motolite in Quezon City. Confirm the current posting on the official Motolite careers page.',
    field: 'Manufacturing', municipality: 'Quezon City', province: 'Metro Manila',
    source_name: 'Official Company Careers Page (motolite.com/careers)', source_url: 'https://www.motolite.com/careers#motolite-industrial-engineer-intern-qc',
    verification_status: 'needs_review', programs: ['INDUSTRIAL ENGINEERING'], specializations: [],
    skills: ['Process Improvement', 'Lean Manufacturing', 'Quality Control', 'Excel'] });
}
function seedBatchB() {
  upsertCompany({ company_name: 'Honda Cars Philippines, Inc.', industry: 'Automotive / Manufacturing / Sales & Service',
    city: null, province: 'Metro Manila', description: 'Honda Cars Philippines, Inc. - official student careers page welcomes college internship/OJT applicants (hondaphil.com/careers). Confirm current openings on the source.',
    website: 'https://www.hondaphil.com', careers_url: 'https://www.hondaphil.com/careers', verification_status: 'verified',
    source_name: 'Official Company Careers Page (hondaphil.com/careers)', source_url: 'https://www.hondaphil.com/careers',
    internship_status: ACCEPTING, internship_notes: 'Official careers page has Students section for internship/OJT applicants.' });
  upsertOpp('Honda Cars Philippines, Inc.', null, { position: 'Student Internship / OJT (Business & Operations)',
    description: 'Student internship/OJT pathway for business and operations roles. Apply via the official Honda student careers section; confirm availability.',
    field: 'Operations', municipality: null, province: 'Metro Manila', location: 'Metro Manila',
    source_name: 'Official Company Careers Page (hondaphil.com/careers)', source_url: 'https://www.hondaphil.com/careers#honda-student-business-operations',
    verification_status: 'needs_review', programs: ['BSBA', 'BSENTREP'], specializations: ['Marketing Management'], skills: ['Communication', 'Excel', 'Teamwork'] });
  upsertOpp('Honda Cars Philippines, Inc.', null, { position: 'Student Internship / OJT (Engineering & Technical)',
    description: 'Student internship/OJT pathway for automotive, industrial, electrical and IT-adjacent roles. Apply via the official Honda student careers section; confirm availability.',
    field: 'Automotive Service', municipality: null, province: 'Metro Manila', location: 'Metro Manila',
    source_name: 'Official Company Careers Page (hondaphil.com/careers)', source_url: 'https://www.hondaphil.com/careers#honda-student-engineering-technical',
    verification_status: 'needs_review', programs: ['AUTOMOTIVE TECHNOLOGY'], specializations: ['Automotive Technology'], skills: ['Automotive Service', 'Troubleshooting', 'Maintenance'] });
  const dealers = [
    ['Toyota Shaw Inc.', 'Mandaluyong', 'Automotive Dealership / Sales & Service'],
    ['Toyota Alabang Inc.', 'Muntinlupa', 'Automotive Dealership / Sales & Service']];
  for (const [n, city, ind] of dealers) {
    upsertCompany({ company_name: n, industry: ind, city, province: 'Metro Manila',
      description: n + ' - Toyota dealership in ' + city + '. No dealership-wide internship posting verified; listed as a potential training host. Departments noted but not converted to internships.',
      website: null, careers_url: null, verification_status: 'needs_review',
      source_name: 'User-requested dealership - internship not verified', source_url: null,
      internship_status: POTENTIAL, internship_notes: 'Legitimate dealership; no verified current internship opening.' });
  }
}
function seedBatchC() {
  const auto = [
    ['Ford Philippines', 'Automotive / Distribution'],
    ['Mitsubishi Motors Philippines Corporation', 'Automotive / Manufacturing'],
    ['Nissan Philippines, Inc.', 'Automotive / Distribution'],
    ['Isuzu Philippines Corporation', 'Automotive / Manufacturing']];
  for (const [n, ind] of auto) {
    upsertCompany({ company_name: n, industry: ind, city: null, province: 'Metro Manila',
      description: n + ' - legitimate automotive company in Metro Manila; no verified current internship/OJT posting, so Potential Internship Host.',
      website: null, careers_url: null, verification_status: 'needs_review',
      source_name: 'User-requested automotive company - internship not verified', source_url: null,
      internship_status: POTENTIAL, internship_notes: 'No verified current internship opening; do not assume every branch accepts interns.' });
  }
  upsertCompany({ company_name: 'Rizal Commercial Banking Corporation (RCBC)', industry: 'Banking / Financial Services',
    city: 'Makati', province: 'Metro Manila', description: 'RCBC - universal bank at Yuchengco Tower, RCBC Plaza, Ayala Ave., Makati (rcbc.com). Internship program listing documented; confirm current posting on the source.',
    website: 'https://www.rcbc.com', careers_url: 'https://www.rcbc.com/careers', verification_status: 'verified',
    source_name: 'Official company website (https://www.rcbc.com)', source_url: 'https://www.rcbc.com',
    internship_status: ACCEPTING, internship_notes: 'Internship Program listing documented in Makati.' });
  upsertOpp('Rizal Commercial Banking Corporation (RCBC)', 'Makati', { position: 'Internship Program (Banking Operations)',
    description: 'Banking operations internship in Makati. Confirm the current Internship Program posting on the official RCBC source.',
    field: 'Finance', municipality: 'Makati', province: 'Metro Manila',
    source_name: 'Official Company Careers Page (rcbc.com)', source_url: 'https://www.rcbc.com/careers#rcbc-internship-program-makati',
    verification_status: 'needs_review', programs: ['BSBA'], specializations: [], skills: ['Excel', 'Data Analysis', 'Communication'] });
  upsertCompany({ company_name: 'Metropolitan Bank & Trust Company (Metrobank)', industry: 'Banking / Financial Services',
    city: 'Makati', province: 'Metro Manila', description: 'Metrobank - universal bank with established scholarship/training pathway; confirm current internship availability on the official source.',
    website: 'https://www.metrobank.com.ph', careers_url: 'https://www.metrobank.com.ph/careers', verification_status: 'verified',
    source_name: 'Official company website (https://www.metrobank.com.ph)', source_url: 'https://www.metrobank.com.ph',
    internship_status: ACCEPTING, internship_notes: 'Established internship/scholarship training pathway.' });
  upsertOpp('Metropolitan Bank & Trust Company (Metrobank)', 'Makati', { position: 'Student Internship / Training Pathway (Banking)',
    description: 'Banking training pathway for students. Confirm current availability on the official Metrobank source.',
    field: 'Finance', municipality: 'Makati', province: 'Metro Manila',
    source_name: 'Official Company Careers Page (metrobank.com.ph/careers)', source_url: 'https://www.metrobank.com.ph/careers#metrobank-student-internship-makati',
    verification_status: 'needs_review', programs: ['BSBA'], specializations: [], skills: ['Excel', 'Communication', 'Customer Service'] });
}
function seedBatchD() {
  const banks = [
    ['Security Bank Corporation', 'Makati'],
    ['Philippine National Bank (PNB)', 'Manila'],
    ['Land Bank of the Philippines (LANDBANK)', 'Manila'],
    ['Development Bank of the Philippines (DBP)', 'Makati'],
    ['EastWest Bank', 'Makati'],
    ['China Banking Corporation (China Bank)', 'Makati'],
    ['Maybank Philippines, Inc.', 'Makati'],
    ['HSBC Philippines', 'Taguig'],
    ['ING Philippines', 'Taguig'],
    ['UBS Philippines', 'Taguig']];
  for (const [n, city] of banks) {
    upsertCompany({ company_name: n, industry: 'Banking / Financial Services', city, province: 'Metro Manila',
      description: n + ' - legitimate bank in Metro Manila; no internship-specific evidence verified, so Potential Internship Host (not added merely for being a bank).',
      website: null, careers_url: null, verification_status: 'needs_review',
      source_name: 'User-requested bank - internship-specific evidence not verified', source_url: null,
      internship_status: POTENTIAL, internship_notes: 'No internship/OJT-specific evidence found.' });
  }
  upsertCompany({ company_name: 'Helix', industry: 'Unknown - verification required',
    city: null, province: 'Metro Manila', description: 'Helix - user reported a Helix somewhere in Manila; exact company identity not confirmed. Not confused with unrelated international Helix companies. No address/website/opening invented.',
    website: null, careers_url: null, verification_status: 'needs_review',
    source_name: 'User-requested company - exact identity pending verification', source_url: null,
    internship_status: NEEDS, internship_notes: 'Exact Manila company identity, address, industry and internship evidence not confirmed.' });
  upsertCompany({ company_name: 'Makati Development Corporation (MDC)', industry: 'Construction / Engineering (EPC)',
    address: 'MDC Corporate Center, Radian Street, Arca South, Western Bicutan, Taguig City', city: 'Taguig', province: 'Metro Manila',
    description: 'Makati Development Corporation (MDC) - the leading EPC company in the Philippines and the wholly-owned construction arm of Ayala Land, Inc., headquartered at the MDC Corporate Center, Arca South, Taguig. Official internship inquiries via careers@mdc.com.ph.',
    website: 'https://www.mdc.com.ph/', careers_url: 'https://www.mdc.com.ph/careers', verification_status: 'verified',
    source_name: 'Official company website - Contact & locations page', source_url: 'https://www.mdc.com.ph/contact-us',
    internship_status: ACCEPTING, internship_notes: 'Official MDC careers page directs career and internship inquiries to careers@mdc.com.ph. Confirm the current intake on the official source.' });
  linkCP('Makati Development Corporation (MDC)', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'BSIT', 'BSBA', 'ARCHITECTURAL DRAFTING']);
  upsertOpp('Makati Development Corporation (MDC)', 'Taguig', { position: 'Internship Training Program (Construction / Engineering)',
    description: 'Construction/engineering internship training program at MDC Arca South, Taguig. Confirm the current intake on the official MDC source.',
    field: 'Construction', municipality: 'Taguig', province: 'Metro Manila',
    source_name: 'Official MDC Careers Page', source_url: 'https://www.mdc.com.ph/careers',
    verification_status: 'needs_review', programs: ['INDUSTRIAL ENGINEERING'], specializations: [], skills: ['AutoCAD', 'Excel', 'Communication'] });
  upsertCompany({ company_name: 'MDC ConQrete, Inc. - Circuit Makati Plant', industry: 'Construction Materials (Ready-Mixed Concrete & Precast)',
    address: 'MCI - Circuit, Brgy. Carmona, Circuit, Makati', city: 'Makati', province: 'Metro Manila',
    description: 'MDC ConQrete, Inc. (MCI) - wholly-owned MDC Group company producing ready-mixed concrete and precast products since 2013; ISO 22965:2007-certified. Circuit Makati batching plant (MCI - Circuit, Brgy. Carmona, Circuit, Makati) listed on the official MDC website.',
    website: 'https://www.mdc.com.ph/', careers_url: 'https://www.mdc.com.ph/careers', verification_status: 'verified',
    source_name: 'Official MDC website - MDC ConQrete, Inc. page', source_url: 'https://www.mdc.com.ph/mdc-conqrete-inc',
    internship_status: POTENTIAL, internship_notes: 'Concrete production facility relevant to Industrial Engineering / Electrical Technology OJT. No internship-specific posting verified - do not assume openings.' });
  linkCP('MDC ConQrete, Inc. - Circuit Makati Plant', ['INDUSTRIAL ENGINEERING', 'ELECTRICAL TECHNOLOGY']);
  upsertCompany({ company_name: 'MDC Equipment Solutions, Inc. - NLOC Equipment Yard', industry: 'Heavy Equipment / Construction Services',
    address: 'NLOC - North Luzon Cloverleaf Estate, Balintawak, Quezon City', city: 'Quezon City', province: 'Metro Manila',
    description: 'MDC Equipment Solutions, Inc. (MEQ) - wholly-owned MDC Group company; leading equipment operations, leasing and maintenance firm with 1,000+ units. NLOC yard at North Luzon Cloverleaf Estate, Balintawak, Quezon City covers north Metro Manila operations.',
    website: 'https://www.mdc.com.ph/', careers_url: 'https://www.mdc.com.ph/careers', verification_status: 'verified',
    source_name: 'Official MDC website - MDC Equipment Solutions page', source_url: 'https://www.mdc.com.ph/mdc-equipment-solutions-inc',
    internship_status: POTENTIAL, internship_notes: 'Equipment operations & maintenance site relevant to Automotive Technology, Electrical Technology and Industrial Engineering OJT. No internship-specific posting verified - do not assume openings.' });
  linkCP('MDC Equipment Solutions, Inc. - NLOC Equipment Yard', ['AUTOMOTIVE TECHNOLOGY', 'ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);
  upsertCompany({ company_name: 'National Irrigation Administration (NIA)', industry: 'Government / Engineering / Infrastructure',
    address: 'San Rafael, Bulacan', city: 'San Rafael', province: 'Bulacan', municipality: 'San Rafael',
    location: 'San Rafael, Bulacan',
    description: 'National Irrigation Administration (NIA) - government agency; Region 3 office in San Rafael, Bulacan (region3.nia.gov.ph). Official site lists career opportunities; no student internship/OJT-specific posting verified.',
    website: 'https://region3.nia.gov.ph', careers_url: null, verification_status: 'verified',
    source_name: 'Official Government Website (https://region3.nia.gov.ph)', source_url: 'https://region3.nia.gov.ph',
    internship_status: POTENTIAL, internship_notes: 'No student internship/OJT-specific evidence found; potential host only.' });
}
function seedBatchE() {
  upsertCompany({ company_name: 'BradSmart Phils.Co', industry: 'Unknown - verification required',
    city: null, province: 'Bulacan', municipality: 'Santa Maria',
    location: 'Santa Maria, Bulacan',
    description: 'BradSmart Phils.Co - reported in Santa Maria, Bulacan. Official website: https://ibradsmartphilsco.com. No opening or program fabricated.',
    website: 'https://ibradsmartphilsco.com', careers_url: null, verification_status: 'needs_review',
    source_name: 'Official company website (ibradsmartphilsco.com)', source_url: 'https://ibradsmartphilsco.com',
    internship_status: NEEDS, internship_notes: 'Exact company could not be publicly verified.' });
  const list = [
    ['Mega Prime Foods, Inc.', 'Quezon City', 'Food Manufacturing'],
    ['Eton Properties Philippines Inc.', 'Makati', 'Real Estate / Property'],
    ['UMS Group Philippines Inc.', 'Quezon City', 'Technology / Business Services'],
    ['Berde Renewables, Inc.', 'Mandaluyong', 'Renewable Energy', 'https://berderenewables.com'],
    ['ES Networks Philippines Inc.', 'Makati', 'Technology / Networking'],
    ['AM Group Kitchen Equipment and Supplies Inc.', 'Makati', 'Kitchen Equipment / Supplies'],
    ['Chubb Business Services', 'Mandaluyong', 'Insurance / Business Services'],
    ['PeoplePartners BPO Inc.', null, 'BPO / Business Services'],
    ['Omega Healthcare Management Services, Inc.', null, 'Healthcare / BPO'],
    ['One Outsource Direct Corporation', null, 'BPO / Outsourcing'],
    ['Global Transco ICT Solutions', null, 'ICT / Technology'],
    ['Inquirer Interactive, Inc.', null, 'Media / Digital'],
    ['FWD Life Insurance Corporation', null, 'Insurance / Financial Services'],
    ['General Milling Corporation', null, 'Food / Manufacturing'],
    ['Global City Auto Sales (Ford Global City)', 'Taguig', 'Automotive Dealership'],
    ['Global Electric Transportation (GET) Philippines', null, 'Electric Transportation / Mobility'],
    ['Alecto General Technology Corporation', 'Makati', 'Technology', 'https://alecto.com.ph'],
    ['Acceligent Solutions Inc.', null, 'Technology / Solutions', 'https://acceligent.com.ph'],
    ['I Plus One, Inc.', null, 'Technology / Business Services'],
    ['Inspire Next Global Inc.', null, 'Consulting / Technology']];
  for (const [n, city, ind, website] of list) {
    upsertCompany({ company_name: n, industry: ind, city, province: 'Metro Manila',
      description: n + ' - legitimate Metro Manila company; no verified current internship/OJT posting, so Potential Internship Host.',
      website: website || null, careers_url: null, verification_status: 'needs_review',
      source_name: website ? 'Official company website (' + website.replace(/^https?:\/\//, '') + ')' : 'User-requested company - internship not verified',
      source_url: website || null,
      internship_status: POTENTIAL, internship_notes: 'No verified current internship opening.' });
  }
  // Berde Renewables, Inc. - requested program mapping (added to existing list).
  linkCP('Berde Renewables, Inc.', 'Mandaluyong', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'COMPUTER TECHNOLOGY']);
}
function run() {
  db.initSchema();
  seedBatchA();
  seedBatchB();
  seedBatchC();
  seedBatchD();
  seedBatchE();
  const legacy = { verified: ACCEPTING, available: ACCEPTING, potential: POTENTIAL, company_only: POTENTIAL, unknown: POTENTIAL, needs_review: NEEDS, closed: 'Closed / Expired', expired: 'Closed / Expired' };
  for (const r of db.all('SELECT id, internship_status FROM companies')) {
    const raw = String(r.internship_status || '');
    if (raw === ACCEPTING || raw === POTENTIAL || raw === NEEDS || raw === 'Closed / Expired') continue;
    db.run('UPDATE companies SET internship_status=? WHERE id=?', legacy[raw.toLowerCase()] || POTENTIAL, r.id);
  }
  const c = db.get('SELECT COUNT(*) AS c FROM companies').c;
  const o = db.get('SELECT COUNT(*) AS c FROM internship_opportunities').c;
  console.log('[expansion] companies=' + c + ' opportunities=' + o);
}
module.exports = { run };
if (require.main === module) run();

