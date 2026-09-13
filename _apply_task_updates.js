'use strict';
/* ============================================================
   Internix - centralized company data revisions (2026-09-13).

   Applies ONLY the user-requested revisions to the EXISTING
   database. Idempotent: safe to re-run. No companies are added
   or removed; only the listed records are touched.

   1.  Easecore Software and IT Corp.        -> https://easecore.com.ph
   2.  Metacom -> Metacom BPO                -> https://metacombpo.com   (Baliwag, Bulacan)
   3.  National Irrigation Administration    -> https://region3.nia.gov.ph (San Rafael, Bulacan)
   4.  3S Offshoring and Outsourcing Inc.    -> https://3s-offshoring.com (San Jose del Monte, Bulacan)
   5.  A. L. Salazar Construction, Inc.      -> https://www.alsci-ph.com
   6.  ACS Pro Global Corporation            -> https://acsproglobal.com
   7.  Acceligent Solutions Inc.             -> https://acceligent.com.ph
   8.  Alecto General Technology Corporation -> https://alecto.com.ph (Makati, Metro Manila)
   9.  Berde Renewables, Inc.                -> https://berderenewables.com (+ 3 program links)
   10. Bradphilsmart -> BradSmart Phils.Co     -> https://ibradsmartphilsco.com
   ============================================================ */

const db = require('./src/db');
db.initSchema();

const TODAY = new Date().toISOString().slice(0, 10);

function log(msg) { console.log('[task-updates] ' + msg); }

/**
 * Update the centralized company record. Only the fields provided are
 * written; everything else on the row is left untouched.
 */
function updateCompany(id, fields) {
  const cur = db.get('SELECT id, company_name FROM companies WHERE id = ?', id);
  if (!cur) { log('SKIP: id ' + id + ' not found'); return null; }
  const sets = [];
  const args = [];
  for (const [col, val] of Object.entries(fields)) { sets.push(col + ' = ?'); args.push(val); }
  sets.push('updated_at = ?'); args.push(TODAY);
  args.push(id);
  db.run('UPDATE companies SET ' + sets.join(', ') + ' WHERE id = ?', ...args);
  log('id ' + id + ' updated (' + Object.keys(fields).join(', ') + ')');
  return cur.company_name;
}

function statusOf(id) {
  return db.get('SELECT verification_status FROM companies WHERE id = ?', id).verification_status;
}

/* ---------------- 1. Easecore Software and IT Corp. ---------------- */
// Official website (already present from a prior correction; enforced here so
// the record is exact). Sync the Easecore opportunity's source_url too - it
// was auto-generated as https://www.easecoresoftwareanditcorp.com and the
// official-website button must open https://easecore.com.ph.
updateCompany(57, {
  website: 'https://easecore.com.ph',
  official_website: 'https://easecore.com.ph',
  official_website_verified: statusOf(57) === 'verified' ? 1 : 0,
  source_status: 'Verified'
});
db.run("UPDATE internship_opportunities SET source_url = 'https://easecore.com.ph', source_name = 'Official company website (easecore.com.ph)' WHERE company_id = 57 AND source_url LIKE '%easecoresoftwareanditcorp%'");
log('Easecore opportunity source_url synced to https://easecore.com.ph');

/* ---------------- 2. Metacom -> Metacom BPO ---------------- */
updateCompany(83, {
  company_name: 'Metacom BPO',
  website: 'https://metacombpo.com',
  official_website: 'https://metacombpo.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (metacombpo.com)',
  source_url: 'https://metacombpo.com',
  description: 'Metacom BPO - legitimate BPO/business-services company in Baliwag, Bulacan; no internship-specific opening verified.'
  // location (Baliwag, Bulacan) is already correct - left untouched.
});

/* ---------------- 3. NIA -> San Rafael, Bulacan ---------------- */
updateCompany(103, {
  municipality: 'San Rafael',
  city: 'San Rafael',
  province: 'Bulacan',
  region: 'Bulacan',
  location: 'San Rafael, Bulacan',
  address: 'San Rafael, Bulacan',
  website: 'https://region3.nia.gov.ph',
  official_website: 'https://region3.nia.gov.ph',
  official_website_verified: 1,
  source_status: 'Verified',
  // careers_url pointed at the national HQ careers page (Quezon City); it is
  // cleared so the official website button opens https://region3.nia.gov.ph.
  careers_url: null,
  source_name: 'Official Government Website (https://region3.nia.gov.ph)',
  source_url: 'https://region3.nia.gov.ph',
  description: 'National Irrigation Administration (NIA) - government agency; Region 3 office in San Rafael, Bulacan (region3.nia.gov.ph). Official site lists career opportunities; no student internship/OJT-specific posting verified.'
});


/* ---------------- 4. 3S Offshoring and Outsourcing Inc. ---------------- */
updateCompany(135, {
  municipality: 'San Jose del Monte',
  city: 'San Jose del Monte',
  province: 'Bulacan',
  region: 'Bulacan',
  location: 'San Jose del Monte, Bulacan',
  website: 'https://3s-offshoring.com',
  official_website: 'https://3s-offshoring.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (3s-offshoring.com)',
  source_url: 'https://3s-offshoring.com'
});

/* ---------------- 5. A. L. Salazar Construction, Inc. ---------------- */
updateCompany(140, {
  website: 'https://www.alsci-ph.com',
  official_website: 'https://www.alsci-ph.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (alsci-ph.com)',
  source_url: 'https://www.alsci-ph.com'
});

/* ---------------- 6. ACS Pro Global Corporation ---------------- */
updateCompany(136, {
  website: 'https://acsproglobal.com',
  official_website: 'https://acsproglobal.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (acsproglobal.com)',
  source_url: 'https://acsproglobal.com'
});

/* ---------------- 7. Acceligent Solutions Inc. ---------------- */
updateCompany(122, {
  website: 'https://acceligent.com.ph',
  official_website: 'https://acceligent.com.ph',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (acceligent.com.ph)',
  source_url: 'https://acceligent.com.ph'
});

/* ---------------- 8. Alecto General Technology Corporation ---------------- */
updateCompany(121, {
  municipality: 'Makati',
  city: 'Makati',
  province: 'Metro Manila',
  region: 'Metro Manila',
  location: 'Makati, Metro Manila',
  website: 'https://alecto.com.ph',
  official_website: 'https://alecto.com.ph',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (alecto.com.ph)',
  source_url: 'https://alecto.com.ph'
});

/* ---------------- 9. Berde Renewables, Inc. ---------------- */
updateCompany(108, {
  website: 'https://berderenewables.com',
  official_website: 'https://berderenewables.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (berderenewables.com)',
  source_url: 'https://berderenewables.com'
});
// Add the requested program mappings (INSERT OR IGNORE - existing programs
// are never removed).
{
  const berde = db.get('SELECT id FROM companies WHERE id = 108');
  const codes = ['INDUSTRIAL ENGINEERING', 'COMPUTER ENGINEERING', 'COMPUTER TECHNOLOGY'];
  for (const code of codes) {
    const p = db.get('SELECT id FROM programs WHERE code = ?', code);
    if (p) {
      db.run('INSERT OR IGNORE INTO company_programs (company_id, program_id, relationship_type) VALUES (?,?,?)', berde.id, p.id, 'relevant');
      log('Berde program linked: ' + code);
    } else {
      log('WARN: program code missing in catalogue: ' + code);
    }
  }
}

/* ---------------- 10. Bradphilsmart -> BradSmart Phils.Co ---------------- */
updateCompany(104, {
  company_name: 'BradSmart Phils.Co',
  website: 'https://ibradsmartphilsco.com',
  official_website: 'https://ibradsmartphilsco.com',
  official_website_verified: 0,
  source_status: 'Needs Verification',
  source_name: 'Official company website (ibradsmartphilsco.com)',
  source_url: 'https://ibradsmartphilsco.com',
  description: 'BradSmart Phils.Co - reported in Santa Maria, Bulacan. Official website: https://ibradsmartphilsco.com. No opening or program fabricated.'
});

/* ---------------- final verification ---------------- */
log('--- final state of all 10 records ---');
const ids = [57, 83, 103, 135, 140, 136, 122, 121, 108, 104];
for (const id of ids) {
  const c = db.get('SELECT id, company_name, municipality, city, province, region, location, website, official_website, careers_url FROM companies WHERE id = ?', id);
  const progs = db.all('SELECT p.code FROM company_programs cp JOIN programs p ON p.id = cp.program_id WHERE cp.company_id = ? ORDER BY p.code', id).map((r) => r.code);
  log(JSON.stringify({ ...c, programs: progs }));
}
const dup = db.all("SELECT company_name, COUNT(*) c FROM companies WHERE company_name LIKE '%etacom%' OR company_name LIKE '%asecore%' OR company_name LIKE '%irrigation%' OR company_name LIKE '%brad%' OR company_name LIKE '%berde%' OR company_name LIKE '%alecto%' OR company_name LIKE '%acceligent%' OR company_name LIKE '%3s%' OR company_name LIKE '%salazar%' OR company_name LIKE '%acs pro%' GROUP BY company_name HAVING c > 1");
log('duplicate check: ' + JSON.stringify(dup));
log('total companies: ' + db.get('SELECT COUNT(*) AS c FROM companies').c);

