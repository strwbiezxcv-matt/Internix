'use strict';
/* ============================================================
   Internix - company data updates (idempotent, no fabrication).

   Verified 2026-09-12 against official sources:
   - Nimbustechnologies, Inc.  -> https://www.nimbus.com.ph/
     (IT solutions provider; office: 4th Floor Riverbend Bldg.,
      1869 P. Domingo St., Brgy. Kasilawan, Makati City)
   - Makati Development Corporation (MDC) group -> https://www.mdc.com.ph/
     (MDC Head Office: MDC Corporate Center, Radian Street, Arca South,
      Western Bicutan, Taguig City - official Contact Us page)
   - MDC ConQrete, Inc. (MDC Group) -> Circuit Makati batching plant
     (Brgy. Carmona, Circuit, Makati - official MDC ConQrete page)
   - MDC Equipment Solutions, Inc. (MDC Group) -> NLOC equipment yard
     (North Luzon Cloverleaf Estate, Balintawak, Quezon City -
      official MDC Equipment Solutions page)

   Only facts published by the companies themselves are stored.
   ============================================================ */

const db = require('./db');

const VERIFY_DATE = '2026-09-12';

function normName(s) {
  return String(s || '').trim().toLowerCase();
}

function findByName(name) {
  const target = normName(name);
  return db.get("SELECT id, company_name, city FROM companies WHERE lower(trim(company_name)) = ?", target) || null;
}

/** Update or insert a company row (never deletes). */
function upsertCompany(d) {
  const ex = findByName(d.company_name);
  const loc = d.location || (d.city ? d.city + ', ' + d.province : d.province || null);
  const mun = d.municipality || d.city || null;
  if (ex) {
    db.run(
      `UPDATE companies SET
         logo_url = ?, description = ?, address = ?, location = ?, city = ?, municipality = ?,
         province = ?, region = ?, industry = ?, website = ?, official_website = ?, careers_url = ?,
         verification_status = ?, source_name = ?, source_url = ?, verified_at = ?,
         internship_status = ?, internship_notes = ?, last_verified_at = ?, updated_at = ?
       WHERE id = ?`,
      d.logo_url || null, d.description, d.address || null, loc, d.city || null, mun,
      d.province, d.region || d.province, d.industry, d.website || null, d.official_website || null, d.careers_url || null,
      d.verification_status || 'verified', d.source_name, d.source_url, VERIFY_DATE,
      d.internship_status, d.internship_notes || null, VERIFY_DATE, VERIFY_DATE,
      ex.id
    );
    return ex.id;
  }
  return db.lastInsertId(db.run(
    `INSERT INTO companies
       (company_name, logo_url, description, address, location, city, municipality, province, region,
        industry, website, official_website, careers_url, verification_status, source_name, source_url, verified_at,
        internship_status, internship_notes, last_verified_at, updated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    d.company_name, d.logo_url || null, d.description, d.address || null, loc, d.city || null, mun,
    d.province, d.region || d.province, d.industry, d.website || null, d.official_website || null, d.careers_url || null,
    d.verification_status || 'verified', d.source_name, d.source_url, VERIFY_DATE,
    d.internship_status, d.internship_notes || null, VERIFY_DATE, VERIFY_DATE, VERIFY_DATE
  ));
}

function linkCP(name, codes) {
  const c = findByName(name);
  if (!c) return;
  for (const code of codes || []) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) db.run('INSERT OR IGNORE INTO company_programs (company_id, program_id, relationship_type) VALUES (?, ?, ?)', c.id, p.id, 'relevant');
  }
}

/* ------------------------- 1. Nimbustechnologies, Inc. ------------------------- */

function updateNimbus() {
  // The record may exist under the old name; rename it instead of duplicating.
  const old = db.get("SELECT id FROM companies WHERE lower(trim(company_name)) IN ('nimbus technologies inc.', 'nimbus technologies', 'nimbustech')");
  const target = findByName('Nimbustechnologies, Inc.');
  let id = target ? target.id : null;
  if (!id && old) {
    id = old.id;
    db.run('UPDATE companies SET company_name = ? WHERE id = ?', 'Nimbustechnologies, Inc.', id);
  }
  const nid = upsertCompany({
    company_name: 'Nimbustechnologies, Inc.',
    industry: 'Technology / IT (IT Solutions Provider)',
    city: 'Makati',
    municipality: 'Makati',
    province: 'Metro Manila',
    region: 'Metro Manila',
    address: '4th Floor Riverbend Bldg., 1869 P. Domingo Street, Brgy. Kasilawan, Makati City',
    description: 'Nimbustechnologies, Inc. is a Philippine IT solutions provider delivering enterprise software, hardware and network solutions - including network and endpoint security, hyper-converged infrastructure, backup/recovery/storage, structured cabling, engineering software and CCTV/biometrics - backed by reliable after-sales support.',
    website: 'https://www.nimbus.com.ph/',
    careers_url: null,
    verification_status: 'verified',
    source_name: 'Official company website (nimbus.com.ph)',
    source_url: 'https://www.nimbus.com.ph/',
    internship_status: 'Potential Internship Host',
    internship_notes: 'IT solutions provider suitable for IT/Computer Engineering OJT. No internship-specific posting verified on the official site - do not assume openings.'
  });
  linkCP('Nimbustechnologies, Inc.', ['BSIT', 'COMPUTER ENGINEERING']);
  return nid;
}



/* ----------------------- 2. MDC - three branch records ----------------------- */

function updateMDC() {
  // (a) Head office - Taguig (official mdc.com.ph Contact Us page)
  const hq = upsertCompany({
    company_name: 'Makati Development Corporation (MDC)',
    industry: 'Construction / Engineering (EPC)',
    city: 'Taguig',
    municipality: 'Taguig',
    province: 'Metro Manila',
    region: 'Metro Manila',
    address: 'MDC Corporate Center, Radian Street, Arca South, Western Bicutan, Taguig City',
    description: 'Makati Development Corporation (MDC) is the leading Engineering, Procurement and Construction (EPC) company in the Philippines and the wholly-owned construction arm of Ayala Land, Inc. - an ISO-certified Quadruple A Platinum contractor behind high-rise, commercial, residential, industrial and infrastructure projects.',
    website: 'https://www.mdc.com.ph/',
    careers_url: 'https://www.mdc.com.ph/careers',
    verification_status: 'verified',
    source_name: 'Official company website - Contact & locations page',
    source_url: 'https://www.mdc.com.ph/contact-us',
    internship_status: 'Accepting Internship',
    internship_notes: 'Official MDC careers page directs career and internship inquiries to careers@mdc.com.ph. Confirm the current intake on the official source.'
  });
  linkCP('Makati Development Corporation (MDC)', ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'BSIT', 'BSBA', 'ARCHITECTURAL DRAFTING']);

  // (b) MDC ConQrete, Inc. - Circuit Makati batching plant (official MDC website)
  const mci = upsertCompany({
    company_name: 'MDC ConQrete, Inc. - Circuit Makati Plant',
    industry: 'Construction Materials (Ready-Mixed Concrete & Precast)',
    city: 'Makati',
    municipality: 'Makati',
    province: 'Metro Manila',
    region: 'Metro Manila',
    address: 'MCI - Circuit, Brgy. Carmona, Circuit, Makati',
    description: 'MDC ConQrete, Inc. (MCI) is a wholly-owned MDC Group company and one of the largest producers of ready-mixed concrete and precast products in the Philippines since 2013, ISO 22965:2007-certified. Its Circuit Makati batching plant (MCI - Circuit, Brgy. Carmona, Circuit, Makati) is listed on the official MDC website.',
    website: 'https://www.mdc.com.ph/',
    official_website: 'https://www.mdc.com.ph/',
    careers_url: 'https://www.mdc.com.ph/careers',
    verification_status: 'verified',
    source_name: 'Official MDC website - MDC ConQrete, Inc. page',
    source_url: 'https://www.mdc.com.ph/mdc-conqrete-inc',
    internship_status: 'Potential Internship Host',
    internship_notes: 'Concrete production facility relevant to Industrial Engineering / Electrical Technology OJT. No internship-specific posting verified - do not assume openings.'
  });
  linkCP('MDC ConQrete, Inc. - Circuit Makati Plant', ['INDUSTRIAL ENGINEERING', 'ELECTRICAL TECHNOLOGY']);

  // (c) MDC Equipment Solutions, Inc. - NLOC yard, Balintawak, Quezon City (official MDC website)
  const meq = upsertCompany({
    company_name: 'MDC Equipment Solutions, Inc. - NLOC Equipment Yard',
    industry: 'Heavy Equipment / Construction Services',
    city: 'Quezon City',
    municipality: 'Quezon City',
    province: 'Metro Manila',
    region: 'Metro Manila',
    address: 'NLOC - North Luzon Cloverleaf Estate, Balintawak, Quezon City',
    description: 'MDC Equipment Solutions, Inc. (MEQ) is a wholly-owned MDC Group company and one of the Philippines\u2019 leading equipment operations, leasing and maintenance companies, with 1,000+ units in operation. Its NLOC yard at North Luzon Cloverleaf Estate, Balintawak, Quezon City covers the north Metro Manila operations area.',
    website: 'https://www.mdc.com.ph/',
    official_website: 'https://www.mdc.com.ph/',
    careers_url: 'https://www.mdc.com.ph/careers',
    verification_status: 'verified',
    source_name: 'Official MDC website - MDC Equipment Solutions page',
    source_url: 'https://www.mdc.com.ph/mdc-equipment-solutions-inc',
    internship_status: 'Potential Internship Host',
    internship_notes: 'Equipment operations & maintenance site relevant to Automotive Technology, Electrical Technology and Industrial Engineering OJT. No internship-specific posting verified - do not assume openings.'
  });
  linkCP('MDC Equipment Solutions, Inc. - NLOC Equipment Yard', ['AUTOMOTIVE TECHNOLOGY', 'ELECTRICAL TECHNOLOGY', 'INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING']);

  // Fix the existing MDC opportunity source (old domain is dead).
  const opp = db.get("SELECT id, source_url FROM internship_opportunities WHERE company_id = ? AND position LIKE 'Internship Training Program%'", hq);
  if (opp && opp.source_url && opp.source_url.includes('makatidevelopmentcorporation.com')) {
    db.run('UPDATE internship_opportunities SET source_name = ?, source_url = ? WHERE id = ?',
      'Official MDC Careers Page', 'https://www.mdc.com.ph/careers', opp.id);
  }
  return { hq, mci, meq };
}

function run() {
  db.initSchema();
  const nimbusId = updateNimbus();
  const mdcIds = updateMDC();
  const count = db.get('SELECT COUNT(*) AS c FROM companies').c;
  console.log('[company-updates] Nimbustechnologies, Inc. -> id ' + nimbusId + ' (Makati, Metro Manila)');
  console.log('[company-updates] MDC Head Office -> id ' + mdcIds.hq + ' | MDC ConQrete Circuit Makati -> id ' + mdcIds.mci + ' | MDC Equipment Solutions NLOC -> id ' + mdcIds.meq);
  console.log('[company-updates] done. Total companies: ' + count);
}

if (require.main === module) run();
module.exports = { run, updateNimbus, updateMDC };
