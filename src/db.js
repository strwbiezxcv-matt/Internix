'use strict';

/**
 * InternConnect database layer.
 *
 * Thin wrapper over Node's built-in node:sqlite (DatabaseSync) that exposes a
 * better-sqlite3-style API: db.run / db.get / db.all / db.lastInsertId.
 * No external dependencies required.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const config = require('./config');

/* --------------------------- connection --------------------------- */

if (!fs.existsSync(path.dirname(config.dbPath))) {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
}

const conn = new DatabaseSync(config.dbPath);

function run(sql, ...params) {
  const stmt = conn.prepare(sql);
  const result = stmt.run(...params);
  return { lastInsertRowid: result.lastInsertId ?? result.lastInsertRowid };
}

function get(sql, ...params) {
  const stmt = conn.prepare(sql);
  return stmt.get(...params);
}

function all(sql, ...params) {
  const stmt = conn.prepare(sql);
  return stmt.all(...params);
}

function lastInsertId(result) {
  return result && result.lastInsertRowid ? Number(result.lastInsertRowid) : null;
}

/**
 * Execute a raw SQL string (multiple statements). Used for schema DDL and
 * administrative operations like table truncation in the seed process.
 */
function exec(sql) {
  conn.exec(sql);
}

/* --------------------------- schema --------------------------- */

function addColumnIfMissing(table, column, ddl) {
  const cols = all(`PRAGMA table_info(${table})`).map((c) => c.name);
  if (!cols.includes(column)) run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function initSchema() {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS specializations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id),
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category TEXT
    );

    CREATE TABLE IF NOT EXISTS internship_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      company_name TEXT NOT NULL,
      logo_url TEXT,
      description TEXT,
      location TEXT,
      city TEXT,
      province TEXT,
      region TEXT,
      industry TEXT,
      contact_info TEXT,
      website TEXT,
      careers_url TEXT,
      company_size TEXT,
      year_established INTEGER,
      verification_status TEXT NOT NULL DEFAULT 'demo',
            source_url TEXT,
      source_name TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS internship_opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      position TEXT NOT NULL,
      description TEXT,
      field_id INTEGER REFERENCES internship_fields(id),
      location TEXT,
      work_arrangement TEXT,
      slots INTEGER,
      duration TEXT,
      required_hours INTEGER,
      application_deadline TEXT,
      application_method TEXT,
      application_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'demo',
      source_name TEXT,
      source_url TEXT,
      verified_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      date_posted TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS opportunity_programs (
      opportunity_id INTEGER NOT NULL REFERENCES internship_opportunities(id) ON DELETE CASCADE,
      program_id INTEGER NOT NULL REFERENCES programs(id),
      PRIMARY KEY (opportunity_id, program_id)
    );

    CREATE TABLE IF NOT EXISTS opportunity_specializations (
      opportunity_id INTEGER NOT NULL REFERENCES internship_opportunities(id) ON DELETE CASCADE,
      specialization_id INTEGER NOT NULL REFERENCES specializations(id),
      PRIMARY KEY (opportunity_id, specialization_id)
    );

    CREATE TABLE IF NOT EXISTS program_fields (
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES internship_fields(id) ON DELETE CASCADE,
      PRIMARY KEY (program_id, field_id)
    );

    CREATE TABLE IF NOT EXISTS specialization_fields (
      specialization_id INTEGER NOT NULL REFERENCES specializations(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES internship_fields(id) ON DELETE CASCADE,
      PRIMARY KEY (specialization_id, field_id)
    );

    CREATE TABLE IF NOT EXISTS opportunity_skills (
      opportunity_id INTEGER NOT NULL REFERENCES internship_opportunities(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES skills(id),
      PRIMARY KEY (opportunity_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id),
      full_name TEXT,
      program_id INTEGER REFERENCES programs(id),
      specialization_id INTEGER REFERENCES specializations(id),
      preferred_field_id INTEGER REFERENCES internship_fields(id),
      preferred_location TEXT,
      work_arrangement TEXT,
      internship_duration TEXT
    );

    CREATE TABLE IF NOT EXISTS student_skills (
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      skill_id INTEGER NOT NULL REFERENCES skills(id),
      PRIMARY KEY (student_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS student_interests (
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES internship_fields(id),
      PRIMARY KEY (student_id, field_id)
    );

    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      opportunity_id INTEGER NOT NULL REFERENCES internship_opportunities(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS saved_opportunities (
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      opportunity_id INTEGER NOT NULL REFERENCES internship_opportunities(id) ON DELETE CASCADE,
      PRIMARY KEY (student_id, opportunity_id)
    );

    CREATE TABLE IF NOT EXISTS program_relationships (
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      related_program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      relationship_type TEXT,
      PRIMARY KEY (program_id, related_program_id)
    );
  `);

  // --- migrations for existing databases ---
  addColumnIfMissing('companies', 'city', 'city TEXT');
  addColumnIfMissing('companies', 'province', 'province TEXT');
  addColumnIfMissing('companies', 'region', 'region TEXT');
  addColumnIfMissing('companies', 'careers_url', 'careers_url TEXT');
  addColumnIfMissing('companies', 'company_size', 'company_size TEXT');
  addColumnIfMissing('companies', 'year_established', 'year_established INTEGER');
  addColumnIfMissing('companies', 'verified_at', 'verified_at TEXT');
  addColumnIfMissing('companies', 'source_name', 'source_name TEXT');
  addColumnIfMissing('companies', 'address', 'address TEXT');
  addColumnIfMissing('companies', 'internship_status', "internship_status TEXT NOT NULL DEFAULT 'unknown'");
  addColumnIfMissing('companies', 'internship_notes', 'internship_notes TEXT');
  addColumnIfMissing('companies', 'barangay', 'barangay TEXT');
  addColumnIfMissing('companies', 'email', 'email TEXT');
  addColumnIfMissing('companies', 'phone', 'phone TEXT');
  addColumnIfMissing('companies', 'last_verified_at', 'last_verified_at TEXT');
  addColumnIfMissing('companies', 'created_at', 'created_at TEXT');
  addColumnIfMissing('companies', 'updated_at', 'updated_at TEXT');
  addColumnIfMissing('companies', 'official_website', 'official_website TEXT');
  addColumnIfMissing('companies', 'official_website_verified', 'official_website_verified INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('companies', 'source_status', 'source_status TEXT');

  addColumnIfMissing('programs', 'description', 'description TEXT');
  addColumnIfMissing('internship_opportunities', 'internship_type', 'internship_type TEXT');
  addColumnIfMissing('internship_opportunities', 'last_verified_at', 'last_verified_at TEXT');
  addColumnIfMissing('internship_opportunities', 'municipality', 'municipality TEXT');
  addColumnIfMissing('internship_opportunities', 'city', 'city TEXT');
  addColumnIfMissing('internship_opportunities', 'province', 'province TEXT');
  addColumnIfMissing('internship_opportunities', 'region', 'region TEXT');
  addColumnIfMissing('companies', 'municipality', 'municipality TEXT');

             // --- company_programs junction table (company-level program relevance) ---
  conn.exec(`CREATE TABLE IF NOT EXISTS company_programs (
    company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL DEFAULT 'relevant',
    PRIMARY KEY (company_id, program_id)
  );`);
  addColumnIfMissing('company_programs', 'relationship_type', "relationship_type TEXT NOT NULL DEFAULT 'relevant'");
}

module.exports = { initSchema, run, get, all, lastInsertId, exec };