'use strict';

/**
 * Internix - location model.
 *
 * Internix matches on the ACTUAL municipality/city/province of an internship
 * opportunity, not on vague region names. This module holds the controlled
 * vocabulary for Bulacan municipalities and Metro Manila cities, plus helpers
 * to normalise the free-text location strings we store and to compute a
 * geographic compatibility score.
 */

// Canonical Bulacan municipalities (region label in the UI is "Bulacan").
const BULACAN = [
  'Angat', 'Balagtas', 'Baliwag', 'Bocaue', 'Bulakan', 'Bustos', 'Calumpit',
  'Doña Remedios Trinidad', 'Guiguinto', 'Hagonoy', 'Malolos', 'Marilao',
  'Meycauayan', 'Norzagaray', 'Obando', 'Pandi', 'Paombong', 'Plaridel',
  'Pulilan', 'San Ildefonso', 'San Jose del Monte', 'San Miguel', 'San Rafael',
  'Santa Maria'
];

// Canonical Metro Manila cities (region label "Metro Manila").
const METRO = [
  'Manila', 'Quezon City', 'Makati', 'Pasig', 'Taguig', 'Mandaluyong',
  'Marikina', 'Pasay', 'Parañaque', 'Las Piñas', 'Muntinlupa', 'Caloocan',
  'Malabon', 'Navotas', 'Valenzuela', 'San Juan', 'Pateros'
];

// Aliases for common alternative spellings -> canonical municipality/city.
const ALIASES = {
  'paranaque': 'Parañaque',
  'paranque': 'Parañaque',
  'paranaqe': 'Parañaque',
  'las pinas': 'Las Piñas',
  'las pinas city': 'Las Piñas',
  'las pinas': 'Las Piñas',
  'pinaspinas': 'Las Piñas',
  'caloocan': 'Caloocan',
  'malabon': 'Malabon',
  'navotas': 'Navotas',
  'valenzuela': 'Valenzuela',
  'san juan': 'San Juan',
  'pateros': 'Pateros',
  'quezon city': 'Quezon City',
  'manila': 'Manila',
  'makati': 'Makati',
  'pasig': 'Pasig',
  'taguig': 'Taguig',
  'mandaluyong': 'Mandaluyong',
  'marikina': 'Marikina',
  'pasay': 'Pasay',
  'muntinlupa': 'Muntinlupa',
  'dona remedios trinidad': 'Doña Remedios Trinidad',
  'san jose del monte': 'San Jose del Monte',
  'santa maria': 'Santa Maria',
  'santa maria, bulacan': 'Santa Maria',
  'norzagaray': 'Norzagaray',
  'meycauayan': 'Meycauayan',
  'malolos': 'Malolos',
  'balagtas': 'Balagtas',
  'baliwag': 'Baliwag',
  'bocaue': 'Bocaue',
  'bulakan': 'Bulakan',
  'bustos': 'Bustos',
  'calumpit': 'Calumpit',
  'guiguinto': 'Guiguinto',
  'hagonoy': 'Hagonoy',
  'marilao': 'Marilao',
  'obando': 'Obando',
  'pandi': 'Pandi',
  'paombong': 'Paombong',
  'plaridel': 'Plaridel',
  'pulilan': 'Pulilan',
  'san ildefonso': 'San Ildefonso',
  'san miguel': 'San Miguel',
  'san rafael': 'San Rafael',
  'angat': 'Angat'
};

const REGION = {
  BULACAN: 'Bulacan',
  METRO: 'Metro Manila'
};

function norm(s) {
  if (!s) return '';
  let v = String(s).toLowerCase();
  if (v.normalize) v = v.normalize('NFKD');
  v = v.replace(/[\u0300-\u036f]/g, '');
  v = v.replace(/['’]/g, '').replace(/[.,]/g, ' ');
  v = v.replace(/[-\s]+/g, ' ').trim();
  return v;
}

const BULACAN_SET = new Set(BULACAN.map(norm));
const METRO_SET = new Set(METRO.map(norm));
const BULACAN_BY_NORM = new Map(BULACAN.map((x) => [norm(x), x]));
const METRO_BY_NORM = new Map(METRO.map((x) => [norm(x), x]));

// Normalised alias map so both "Las Piñas" and "Las Pinas" resolve.
const ALIAS_NORM = {};
for (const [k, v] of Object.entries(ALIASES)) {
  ALIAS_NORM[norm(k)] = v;
}

function findMunicipality(token) {
  const n = norm(token);
  if (!n) return null;
  if (BULACAN_BY_NORM.has(n)) return BULACAN_BY_NORM.get(n);
  if (METRO_BY_NORM.has(n)) return METRO_BY_NORM.get(n);
  const alias = ALIAS_NORM[n];
  if (alias) return alias;
  // Any alias whose normalized form is part of the token (e.g. "Santa Maria, Bulacan")
  for (const k in ALIAS_NORM) {
    if (n === k || n.startsWith(k + ' ') || n.includes(' ' + k + ' ') || n.endsWith(' ' + k)) return ALIAS_NORM[k];
  }
  return null;
}
/**
 * Parse a free-text/structured location into a normalised object.
 * Expects a string such as "Santa Maria, Bulacan", "Makati, Metro Manila",
 * "Malolos", "Quezon City", or an object with municipality/province fields.
 * Returns { municipality, city, province, region, label } or null.
 */
function parseLocation(value) {
  if (!value) return null;
  let municipality = null;
  let city = null;
  let province = null;
  let raw = '';

  if (typeof value === 'object') {
    municipality = value.municipality || value.city || null;
    city = value.city || value.municipality || null;
    province = value.province || value.region || null;
    raw = value.raw || [municipality, province].filter(Boolean).join(', ');
    if (value.region) province = value.region;
  } else {
    raw = String(value).trim();
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    let provinceToken = null;
    for (const p of parts) {
      const n = norm(p);
      if (n === 'bulacan') provinceToken = 'Bulacan';
      else if (n === 'metro manila' || n === 'metromanila') provinceToken = 'Metro Manila';
    }
    if (provinceToken) {
      province = provinceToken;
      for (const p of parts) {
        const m = findMunicipality(p);
        if (m) { municipality = m; break; }
      }
      if (!municipality) municipality = parts[0];
    } else {
      // Single token like "Malolos" or "Santa Maria".
      const m = findMunicipality(raw);
      if (m) {
        municipality = m;
        province = BULACAN_SET.has(norm(m)) ? 'Bulacan' : (METRO_SET.has(norm(m)) ? 'Metro Manila' : null);
      } else {
        municipality = parts[0];
      }
    }
  }

  municipality = municipality && String(municipality).trim();
  city = (city || municipality);
  if (city) city = String(city).trim();

  if (!province) {
    if (municipality && BULACAN_SET.has(norm(municipality))) province = 'Bulacan';
    else if (municipality && METRO_SET.has(norm(municipality))) province = 'Metro Manila';
  }

  const region = (province === 'Bulacan') ? REGION.BULACAN
    : (province === 'Metro Manila' ? REGION.METRO : null);

  const label = municipality
    ? (region ? `${municipality}, ${region}` : municipality)
    : (raw || (province || ''));

  return {
    municipality: municipality || null,
    city: city || null,
    province: province || null,
    region,
    label
  };
}

/**
 * Group locations into UI selectable buckets.
 */
function groupLocations() {
  return {
    regions: [REGION.BULACAN, REGION.METRO],
    bulacan: BULACAN.slice().sort((a, b) => a.localeCompare(b)),
    metro: METRO.slice().sort((a, b) => a.localeCompare(b)),
    all: [...BULACAN, ...METRO].sort((a, b) => a.localeCompare(b))
  };
}

/**
 * Resolve a user-selected location into { province, municipality, isMunicipality }.
 */
function resolveSelection(sel) {
  if (!sel) return null;
  const n = norm(sel);
  if (n === 'bulacan') return { province: REGION.BULACAN, municipality: null };
  if (n === 'metro manila' || n === 'metro') return { province: REGION.METRO, municipality: null };
  const parsed = parseLocation(sel);
  if (parsed && parsed.municipality) {
    const province = BULACAN_SET.has(norm(parsed.municipality)) ? REGION.BULACAN : REGION.METRO;
    return { province, municipality: parsed.municipality };
  }
  if (String(sel).toLowerCase().includes('bulacan')) return { province: REGION.BULACAN, municipality: null };
  if (String(sel).toLowerCase().includes('manila')) return { province: REGION.METRO, municipality: null };
  return { province: null, municipality: String(sel).trim() || null };
}

/**
 * Location compatibility (0..1) between a selection and an opportunity location.
 */
function locationScore(selection, oppLoc) {
  if (!selection) return 0.5;
  if (!oppLoc) return 0.3;
  const sProvince = selection.province;
  const sMunicipality = selection.municipality;
  const oProvince = oppLoc.province;
  const oMunicipality = oppLoc.municipality;

  if (sMunicipality) {
    if (oMunicipality && norm(oMunicipality) === norm(sMunicipality)) return 1.0;
    if (oProvince && sProvince && norm(oProvince) === norm(sProvince)) return 0.75;
    return 0.15;
  }
  if (sProvince) {
    if (oProvince && norm(oProvince) === norm(sProvince)) return 0.9;
    if (sProvince === REGION.METRO && oProvince === REGION.METRO) return 0.9;
    return 0.1;
  }
  return 0.5;
}

module.exports = {
  BULACAN,
  METRO,
  REGION,
  parseLocation,
  resolveSelection,
  locationScore,
  groupLocations,
  norm,
  findMunicipality
};