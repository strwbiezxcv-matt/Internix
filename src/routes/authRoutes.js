'use strict';

/**
 * Authentication routes: student/company registration, login, logout, and the
 * "who am I" endpoint used by the front end on load.
 */

const db = require('../db');
const auth = require('../auth');
const { ok, fail } = require('../util');

const PROGRAMS_REQUIRED = ['BSBA', 'BSENTREP', 'COMPUTER ENGINEERING', 'INDUSTRIAL ENGINEERING', 'BINDTECH', 'BSIT'];

function register(router) {
  router.post('/api/auth/register', (ctx) => {
    const { email, password, role } = ctx.body || {};
    if (!email || !password) return fail(ctx.res, 'Email and password are required.');
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return fail(ctx.res, 'Please provide a valid email address.');
    }
    if (String(password).length < 8) {
      return fail(ctx.res, 'Password must be at least 8 characters.');
    }
    if (!['student', 'company'].includes(role)) {
      return fail(ctx.res, 'Role must be student or company.');
    }
    if (db.get('SELECT id FROM users WHERE email = ?', email.trim())) {
      return fail(ctx.res, 'An account with that email already exists.', 409);
    }

    const user = db.transaction(() => {
      const { hash, salt } = auth.hashPassword(password);
      const uid = db.lastInsertId(db.run(
        'INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)',
        email.trim(), `${salt}:${hash}`, role
      ));
      if (role === 'student') {
        const bodyNames = ctx.body || {};
        const fullName = (bodyNames.fullName || '').toString().trim();
        let programId = null;
        if (bodyNames.program) {
          const prog = db.get('SELECT id FROM programs WHERE code = ?', String(bodyNames.program).toUpperCase());
          if (prog) programId = prog.id;
        }
        if (!fullName) {
          throw new Error('Full name is required for a student account.');
        }
        db.run(
          `INSERT INTO students (user_id, full_name, program_id)
           VALUES (?, ?, ?)`,
          uid, fullName, programId || db.get('SELECT id FROM programs WHERE code = \'BSIT\'').id
        );
      } else {
        const bodyNames = ctx.body || {};
        const companyName = (bodyNames.companyName || '').toString().trim();
        if (!companyName) {
          throw new Error('Company name is required for a company account.');
        }
        db.run(
          `INSERT INTO companies (user_id, company_name) VALUES (?, ?)`,
          uid, companyName
        );
      }
      return uid;
    });

    // Log them straight in.
    const session = auth.createSession(user);
    auth.setSessionCookie(ctx.res, session.token);
    const userRow = auth.getUser(user);
    const { password_hash, ...safe } = userRow;
    return ok(ctx.res, { user: safe, student: userRow.student, company: userRow.company }, 201);
  });

  router.post('/api/auth/login', (ctx) => {
    const { email, password } = ctx.body || {};
    if (!email || !password) return fail(ctx.res, 'Email and password are required.');
    const userRow = db.get('SELECT * FROM users WHERE email = ?', String(email).trim());
    if (!userRow || !auth.verifyStoredPassword(password, userRow.password_hash)) {
      return fail(ctx.res, 'Invalid email or password.', 401);
    }
    const session = auth.createSession(userRow.id);
    auth.setSessionCookie(ctx.res, session.token);
    const full = auth.getUser(userRow.id);
    const { password_hash, ...safe } = full;
    return ok(ctx.res, { user: safe, student: full.student, company: full.company });
  });

  router.post('/api/auth/logout', (ctx) => {
    const token = auth.readSessionCookie(ctx.req);
    auth.clearSessionCookie(ctx.res);
    if (token) auth.destroySession(auth.hashToken(token));
    return ok(ctx.res, { loggedOut: true });
  });

  router.get('/api/auth/me', (ctx) => {
    if (!ctx.user) return ok(ctx.res, { user: null });
    const full = auth.getUser(ctx.user.id);
    const { password_hash, ...safe } = full;
    return ok(ctx.res, { user: safe, student: full.student, company: full.company });
  });
}

module.exports = { register };