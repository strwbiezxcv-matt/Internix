'use strict';
/* Internix phase-2 expansion: additional real Bulacan + Metro Manila companies.
   Idempotent; same upsert/dedup pattern as seedExpansion.js. No fabricated
   internship openings — new companies default to Potential Internship Host
   unless documented evidence exists. */
const db = require('./db');

const ACCEPTING = 'Accepting Internship';
const POTENTIAL = 'Potential Internship Host';
const NEEDS = 'Needs Verification';
const TODAY = '2026-09-12';

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
  } else {
    db.run('INSERT INTO companies (company_name,logo_url,description,address,location,city,municipality,province,region,industry,contact_info,website,careers_url,company_size,year_established,verification_status,source_name,source_url,verified_at,internship_status,internship_notes,last_verified_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', d.company_name, ...args);
  }
  const id = ex ? ex.id : db.get("SELECT id FROM companies WHERE company_name = ? ORDER BY id DESC LIMIT 1", d.company_name).id;
  if (d.website) {
    const verified = d.verification_status === 'verified';
    db.run('UPDATE companies SET official_website = COALESCE(official_website, ?), official_website_verified = ?, source_status = ? WHERE id = ?', d.website, verified ? 1 : 0, verified ? 'Verified' : 'Needs Verification', id);
  }
  return id;
}
const PROG_ALIASES = {
  BSIE: 'INDUSTRIAL ENGINEERING', BSBA: 'BSBA', BSENTREP: 'BSENTREP', BSIT: 'BSIT',
  BSCPT: 'COMPUTER TECHNOLOGY', BSCPE: 'COMPUTER ENGINEERING',
  BADG: 'ARCHITECTURAL DRAFTING', BSAUTO: 'AUTOMOTIVE TECHNOLOGY',
  BSFT: 'FOOD TECHNOLOGY', BSELTECH: 'ELECTRICAL TECHNOLOGY'
};
function linkCP(name, city, codes) {
  const c = findCompany(name, city || null);
  if (!c) return;
  for (const raw of codes || []) {
    const code = PROG_ALIASES[raw] || raw;
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) db.run('INSERT OR IGNORE INTO company_programs (company_id,program_id,relationship_type) VALUES (?,?,?)', c.id, p.id, 'relevant');
  }
}
function bulacanBatch() {
  const B = 'Bulacan';
  const list = [
    { company_name: 'Magna Prime Chemical Technologies, Inc.', industry: 'Chemical Manufacturing', city: 'Baliwag', province: B, website: 'https://magnaprime.com.ph', verification_status: 'verified',
      description: 'Magna Prime Chemical Technologies, Inc. - Philippine chemical manufacturing company (construction chemicals and related products).',
      source_name: 'Official company website (magnaprime.com.ph)', source_url: 'https://magnaprime.com.ph',
      internship_status: POTENTIAL },
    { company_name: 'Halla Chem Philippines Inc.', industry: 'Chemical Manufacturing', city: 'Malolos', province: B,
      description: 'Halla Chem Philippines Inc. - chemical manufacturing company operating in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan manufacturer', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'JD Foods Corporation', industry: 'Food Manufacturing', city: 'Bustos', province: B, website: 'https://www.jdfoods.com.ph', verification_status: 'verified',
      description: 'JD Foods Corporation - Philippine food manufacturing company (powdered beverages and related products).',
      source_name: 'Official company website (jdfoods.com.ph)', source_url: 'https://www.jdfoods.com.ph',
      internship_status: POTENTIAL },
    { company_name: 'Goodyear Container Corporation', industry: 'Packaging / Manufacturing', city: 'Malolos', province: B, website: 'https://www.goodyearcontainer.com', verification_status: 'verified',
      description: 'Goodyear Container Corporation - corrugated carton and packaging manufacturer based in Malolos, Bulacan.',
      source_name: 'Official company website (goodyearcontainer.com)', source_url: 'https://www.goodyearcontainer.com',
      internship_status: POTENTIAL },
    { company_name: 'Bauertek Corp.', industry: 'Pharmaceutical / Healthcare Manufacturing', city: 'Santa Maria', province: B, website: 'https://www.bauertek.com', verification_status: 'verified',
      description: 'Bauertek Corp. - Philippine pharmaceutical and healthcare products manufacturer in Santa Maria, Bulacan.',
      source_name: 'Official company website (bauertek.com)', source_url: 'https://www.bauertek.com',
      internship_status: POTENTIAL },
    { company_name: 'Pascual Laboratories, Inc.', industry: 'Pharmaceutical Manufacturing', city: 'Meycauayan', province: B, website: 'https://www.pascuallab.com', verification_status: 'verified',
      description: 'Pascual Laboratories, Inc. - Philippine pharmaceutical manufacturer with a plant in Meycauayan, Bulacan.',
      source_name: 'Official company website (pascuallab.com)', source_url: 'https://www.pascuallab.com',
      internship_status: POTENTIAL },
    { company_name: 'Froneri Philippines, Inc.', industry: 'Food Manufacturing (Ice Cream)', city: 'Bocaue', province: B, website: 'https://www.froneri.com', verification_status: 'verified',
      description: 'Froneri Philippines, Inc. - international ice cream manufacturer (Nestlé partnership) with a Bulacan plant.',
      source_name: 'Official company website (froneri.com)', source_url: 'https://www.froneri.com',
      internship_status: POTENTIAL },
    { company_name: 'Fisher Farms, Inc.', industry: 'Food Processing / Aquaculture', city: 'San Jose del Monte', province: B, website: 'https://www.fisherfarms.com.ph', verification_status: 'verified',
      description: 'Fisher Farms, Inc. - aquaculture and processed seafood food manufacturer in San Jose del Monte, Bulacan.',
      source_name: 'Official company website (fisherfarms.com.ph)', source_url: 'https://www.fisherfarms.com.ph',
      internship_status: POTENTIAL },
    { company_name: 'EASE Technology Solutions, Inc.', industry: 'IT Services / Software', city: 'Meycauayan', province: B,
      description: 'EASE Technology Solutions, Inc. - IT solutions provider operating in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan IT services firm', source_url: null,
      internship_status: NEEDS }
  ];
  const progMap = {
    'Magna Prime Chemical Technologies, Inc.': ['BSIE', 'BSBA', 'BSFT'],
    'Halla Chem Philippines Inc.': ['BSIE', 'BSFT'],
    'JD Foods Corporation': ['BSFT', 'BSIE', 'BSBA'],
    'Goodyear Container Corporation': ['BSIE', 'BSBA'],
    'Bauertek Corp.': ['BSFT', 'BSIE', 'BSBA'],
    'Pascual Laboratories, Inc.': ['BSFT', 'BSIE', 'BSBA'],
    'Froneri Philippines, Inc.': ['BSFT', 'BSIE', 'BSBA'],
    'Fisher Farms, Inc.': ['BSFT', 'BSIE', 'BSBA'],
    'EASE Technology Solutions, Inc.': ['BSIT', 'BSCPT', 'BSCPE']
  };
  for (const d of list) {
    d.internship_notes = 'Legitimate Bulacan company; classified as ' + d.internship_status + ' because no current internship/OJT posting was verified. Do not assume openings.';
    upsertCompany(d);
    linkCP(d.company_name, d.city, progMap[d.company_name] || []);
  }
  const list2 = [
    { company_name: 'Eontech Solutions Inc.', industry: 'IT Services / Software', city: 'Malolos', province: B,
      description: 'Eontech Solutions Inc. - IT solutions and software services company in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan IT services firm', source_url: null,
      internship_status: NEEDS },
    { company_name: '3S Offshoring and Outsourcing Inc.', industry: 'BPO / Business Services', city: 'Malolos', province: B,
      description: '3S Offshoring and Outsourcing Inc. - offshoring/outsourcing services company in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan BPO', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'ACS Pro Global Corporation', industry: 'BPO / Business Services', city: 'Baliwag', province: B,
      description: 'ACS Pro Global Corporation - business process outsourcing company in Baliwag, Bulacan.',
      source_name: 'Company record - publicly listed Bulacan BPO', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'DyipPay', industry: 'Fintech / IT Services', city: 'Santa Maria', province: B,
      description: 'DyipPay - Philippine payment/fintech technology startup.',
      source_name: 'Company record - publicly listed fintech startup', source_url: null,
      internship_status: NEEDS },
    { company_name: 'Jireh Engineering Services', industry: 'Engineering Services', city: 'Malolos', province: B,
      description: 'Jireh Engineering Services - local engineering services firm in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan engineering firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'H&U Silicone Sealant Manufacturing OPC', industry: 'Chemical / Sealant Manufacturing', city: 'Marilao', province: B,
      description: 'H&U Silicone Sealant Manufacturing OPC - silicone sealant manufacturer in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan manufacturer', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'A. L. Salazar Construction, Inc.', industry: 'Construction', city: 'Malolos', province: B,
      description: 'A. L. Salazar Construction, Inc. - construction contractor based in Bulacan.',
      source_name: 'Company record - publicly listed Bulacan construction firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Pru Life UK - Baliuag Office', industry: 'Insurance', city: 'Baliwag', province: B, website: 'https://www.prulifeuk.com.ph', verification_status: 'verified',
      description: 'Pru Life UK Baliuag office - branch of the British life insurer in the Philippines.',
      branch: 'Baliuag',
      source_name: 'Official company website (prulifeuk.com.ph)', source_url: 'https://www.prulifeuk.com.ph',
      internship_status: POTENTIAL },
    { company_name: 'Lachicae Curtain Shop', industry: 'Retail / Home Furnishings', city: 'Santa Maria', province: B,
      description: 'Lachicae Curtain Shop - small local home-furnishings retail business in Santa Maria, Bulacan.',
      source_name: 'Company record - user-identified local business', source_url: null,
      internship_status: NEEDS }
  ];
  const progMap2 = {
    'Eontech Solutions Inc.': ['BSIT', 'BSCPT'],
    '3S Offshoring and Outsourcing Inc.': ['BSBA', 'BSENTREP', 'BSIT'],
    'ACS Pro Global Corporation': ['BSBA', 'BSENTREP'],
    'DyipPay': ['BSIT', 'BSCPT', 'BSBA'],
    'Jireh Engineering Services': ['BSIE', 'BSELTECH'],
    'H&U Silicone Sealant Manufacturing OPC': ['BSIE', 'BSFT'],
    'A. L. Salazar Construction, Inc.': ['BADG', 'BSIE', 'BSBA'],
    'Pru Life UK - Baliuag Office': ['BSBA', 'BSENTREP'],
    'Lachicae Curtain Shop': ['BSENTREP']
  };
  for (const d of list2) {
    d.internship_notes = 'Legitimate Bulacan company; classified as ' + d.internship_status + ' because no current internship/OJT posting was verified. Do not assume openings.';
    upsertCompany(d);
    linkCP(d.company_name, d.city, progMap2[d.company_name] || []);
  }
}
function metroBatch() {
  const M = 'Metro Manila';
  const list = [
    { company_name: 'Golden Suntec Solutions, Inc.', industry: 'IT Services / Software', city: 'Quezon City', province: M,
      description: 'Golden Suntec Solutions, Inc. - IT solutions and services company in Quezon City.',
      source_name: 'Company record - publicly listed Metro Manila IT firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'TeleEye Philippines Inc.', industry: 'IT / Video Security Solutions', city: 'Quezon City', province: M,
      description: 'TeleEye Philippines Inc. - video security and surveillance technology solutions provider.',
      source_name: 'Company record - publicly listed Metro Manila IT firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Lightweight Solutions, Inc.', industry: 'IT Services / Software', city: 'Quezon City', province: M,
      description: 'Lightweight Solutions, Inc. - software/IT services company in Metro Manila.',
      source_name: 'Company record - publicly listed Metro Manila IT firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Filmetrics Corporation', industry: 'Electronics / Instrumentation', city: 'Makati', province: M,
      description: 'Filmetrics Corporation - scientific instrumentation and electronics company in Metro Manila.',
      source_name: 'Company record - publicly listed Metro Manila electronics firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Sapient Global Services, Inc.', industry: 'Business Services / Consulting', city: 'Makati', province: M,
      description: 'Sapient Global Services, Inc. - business services and consulting firm in Metro Manila.',
      source_name: 'Company record - publicly listed Metro Manila services firm', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Rudolf Lietz, Inc.', industry: 'Import / Distribution', city: 'Makati', province: M, website: 'https://www.lietz.com', verification_status: 'verified',
      description: 'Rudolf Lietz, Inc. - long-established German-Filipino import/distribution company in Makati.',
      source_name: 'Official company website (lietz.com)', source_url: 'https://www.lietz.com',
      internship_status: POTENTIAL },
    { company_name: 'AXA Philippines', industry: 'Insurance / Financial Services', city: 'Makati', province: M, website: 'https://www.axa.com.ph', verification_status: 'verified',
      description: 'AXA Philippines - one of the largest insurance companies in the country, headquartered in Makati.',
      source_name: 'Official company website (axa.com.ph)', source_url: 'https://www.axa.com.ph',
      internship_status: POTENTIAL },
    { company_name: 'Toyota Shaw Inc. - Shaw Boulevard Dealership', industry: 'Automotive Dealership', city: 'Mandaluyong', province: M,
      description: 'Toyota Shaw dealership branch (Mandaluyong) - retail sales, service, and parts for Toyota vehicles.',
      branch: 'Shaw Blvd., Mandaluyong',
      source_name: 'Dealer record - official Toyota dealer in Mandaluyong', source_url: null,
      internship_status: POTENTIAL },
    { company_name: 'Hyundai Motor Philippines, Inc.', industry: 'Automotive / Distribution', city: 'Makati', province: M, website: 'https://www.hyundai.com.ph', verification_status: 'verified',
      description: 'Hyundai Motor Philippines, Inc. - official Hyundai distributor for the Philippines, Makati HQ.',
      source_name: 'Official company website (hyundai.com.ph)', source_url: 'https://www.hyundai.com.ph',
      internship_status: POTENTIAL }
  ];
  const progMap = {
    'Golden Suntec Solutions, Inc.': ['BSIT', 'BSCPT', 'BSCPE'],
    'TeleEye Philippines Inc.': ['BSCPE', 'BSELTECH', 'BSIT'],
    'Lightweight Solutions, Inc.': ['BSIT', 'BSCPT'],
    'Filmetrics Corporation': ['BSCPE', 'BSELTECH', 'BSIE'],
    'Sapient Global Services, Inc.': ['BSBA', 'BSENTREP', 'BSIT'],
    'Rudolf Lietz, Inc.': ['BSBA', 'BSENTREP'],
    'AXA Philippines': ['BSBA', 'BSENTREP', 'BSIT'],
    'Toyota Shaw Inc. - Shaw Boulevard Dealership': ['BSAUTO', 'BSBA', 'BSIE'],
    'Hyundai Motor Philippines, Inc.': ['BSAUTO', 'BSBA', 'BSIE']
  };
  for (const d of list) {
    d.internship_notes = 'Legitimate Metro Manila company; classified as ' + d.internship_status + ' because no current internship/OJT posting was verified. Do not assume openings.';
    upsertCompany(d);
    linkCP(d.company_name, d.city, progMap[d.company_name] || []);
  }
}

function run() {
  bulacanBatch();
  metroBatch();
}

module.exports = { run };

if (require.main === module) {
  db.initSchema();
  run();
  const by = db.all('SELECT province, COUNT(*) c FROM companies GROUP BY province');
  console.log('counts:', JSON.stringify(by));
  console.log('total:', db.get('SELECT COUNT(*) c FROM companies').c);
}
