'use strict';
process.chdir(__dirname);
const fs = require('node:fs');
const BASE = 'http://localhost:3000';
const out = [];
const g = (o, s, d = null) => {
  if (!o) return d;
  let v = o;
  for (const k of String(s).split('.')) {
    if (v == null) return d;
    v = /^\d+$/.test(k) ? v[+k] : v[k];
  }
  return (v === undefined || v === null ? d : v);
};
function log() {
  out.push([].slice.call(arguments).map(String).join(' '));
}
function getCookie(r) {
  return (r && r.setCookie) || '';
}
function parseSetCookie(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0] || '';
}
async function req(method, path, body, cookie) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json, cookie: parseSetCookie(res) };
}
(async () => {
  let r = await req('GET', '/api/catalog');
  log('CATALOG', r.status, g(r.json, 'data.programs.length', 0), g(r.json, 'data.skills.length', 0));

	r = await req('POST', '/api/auth/login', { email: 'student@demo.com', password: 'password123' });
	  const cookie = r.cookie;
	  log('LOGIN_STUDENT', r.status);
	  if (r.status === 200 && cookie) {
	    r = await req('GET', '/api/student/recommendations', null, cookie);
	    log('RECOMMEND', r.status);
	    const recs = g(r.json, 'data', null);
	    if (Array.isArray(recs)) {
	      recs.slice(0, 3).forEach((x) => {
	        log('   ', x.match.score + '%', g(x, 'opportunity.position'), '::', g(x, 'match.reason'));
	      });
	    } else {
	      log('   no data', JSON.stringify(r.json));
	    }

	    r = await req('GET', '/api/opportunities', null, cookie);
	    const list = g(r.json, 'data', null);
	    log('BROWSE', r.status, 'results=', (Array.isArray(list) ? list.length : 0), 'top=', (list && list[0] && (list[0].match.score + '% ' + list[0].opportunity.position)) || '-');

	    r = await req('GET', '/api/opportunities/1', null, cookie);
	    log('DETAIL', r.status, 'score=', g(r.json, 'data.match.score'), 'checks=', g(r.json, 'data.match.checks.length'));

	    r = await req('POST', '/api/student/save', { opportunityId: 4 }, cookie);
	    log('SAVE', r.status, g(r.json, 'data.saved'));
	    r = await req('POST', '/api/student/apply', { opportunityId: 1 }, cookie);
	    log('APPLY', r.status, g(r.json, 'data.applied'));
	    r = await req('POST', '/api/student/apply', { opportunityId: 1 }, cookie);
	    log('APPLY_DUP', r.status, g(r.json, 'error'));

	    r = await req('GET', '/api/student/dashboard', null, cookie);
	    log('DASH', r.status, 'counts=', JSON.stringify(g(r.json, 'data.counts')), 'top=', g(r.json, 'data.top_matches.0.match.score'), '%');

	    r = await req('GET', '/api/student/saved', null, cookie);
	    log('SAVED_LIST', r.status, 'n=', g(r.json, 'data.length'));

	    r = await req('PUT', '/api/student/profile', {
	      fullName: 'Maria Santos', programCode: 'BSIT',
	      preferredLocation: 'Bulacan', workArrangement: 'On-site',
	      internshipDuration: '3 months',
	      skills: ['HTML', 'CSS', 'JavaScript', 'Git', 'React', 'SQL'],
	      interests: ['Web Development', 'IT Support', 'Software QA']
	    }, cookie);
	    log('PROFILE', r.status, 'firstSkill=', g(r.json, 'data.skills.0'));

	    r = await req('GET', '/api/student/recommendations', null, cookie);
	    log('RECOMMEND2', r.status, 'top=', g(r.json, 'data.0.match.score'), '%', g(r.json, 'data.0.opportunity.position'));
	  }

	  r = await req('POST', '/api/auth/login', { email: 'company@demo.com', password: 'password123' });
	  const ccookie = r.cookie; global.__ccookie = ccookie;
	  log('LOGIN_COMPANY', r.status);
	  if (r.status === 200 && ccookie) {
	    r = await req('GET', '/api/company/dashboard', null, ccookie);
	    log('COMP_DASH', r.status, 'opps=', g(r.json, 'data.opportunities.length'));

	    r = await req('POST', '/api/company/opportunities', {
	      position: 'IT Security Intern', description: 'Assist with security audits and compliance.',
	      field_id: 6, location: 'Makati', work_arrangement: 'Hybrid', slots: 3, duration: '3 months',
	      required_hours: 486, application_deadline: '2026-10-15', application_method: 'hr@abctech.com.ph',
	      programs: ['BSIT', 'COMPUTER ENGINEERING'], skills: ['Network Setup', 'Windows', 'Communication']
	    }, ccookie);
	    log('COMP_CREATE', r.status, 'pos=', g(r.json, 'data.position'), 'prog=', JSON.stringify(g(r.json, 'data.programs', [])));
	    global.__newOppId = g(r.json, 'data.id', null);

	    r = await req('GET', '/api/company/dashboard', null, ccookie);
	    const myOpps = g(r.json, 'data.opportunities', []);
	    const ownedId = (Array.isArray(myOpps) && myOpps.length) ? myOpps[0].id : null;
	    log('COMP_DASH2', r.status, 'opps=', (Array.isArray(myOpps) ? myOpps.length : 0));

	    if (ownedId !== null) {
	      r = await req('GET', '/api/company/opportunities/' + ownedId + '/applicants', null, ccookie);
	      log('APPLICANTS', r.status, 'n=', g(r.json, 'data.length'), 'first=', g(r.json, 'data.0.full_name'));
	      const firstId = g(r.json, 'data.0.id', null);
	      if (firstId !== null) {
	        r = await req('PATCH', '/api/company/applications/' + firstId, { status: 'interview' }, ccookie);
	        log('APP_STATUS', r.status, 'now=', g(r.json, 'data.status'));
	      }
	    }
	  }

	  
	  /* --- full applicant flow: student applies to company's new opportunity --- */
	  if (typeof global.__newOppId === 'number' && global.__ccookie) {
	    let r2 = await req('POST', '/api/auth/login', { email: 'student@demo.com', password: 'password123' });
	    const scookie = r2.cookie;
	    r2 = await req('POST', '/api/student/apply', { opportunityId: global.__newOppId }, scookie);
	    log('STUDENT_APPLY_NEW', r2.status, g(r2.json, 'data.applied'));

	    r2 = await req('GET', '/api/company/opportunities/' + global.__newOppId + '/applicants', null, global.__ccookie);
	    log('APPLICANTS2', r2.status, 'n=', g(r2.json, 'data.length'), 'first=', g(r2.json, 'data.0.full_name'));
	    const appId = g(r2.json, 'data.0.id', null);
	    if (appId !== null) {
	      r2 = await req('PATCH', '/api/company/applications/' + appId, { status: 'interview' }, global.__ccookie);
	      log('APP_STATUS', r2.status, 'now=', g(r2.json, 'data.status'));
	    }
	  }
	  fs.writeFileSync('_api.log', out.join('\n'), 'utf8');
	  console.log('DONE');
})().catch((e) => {
	  fs.writeFileSync('_api.log', out.join('\n') + '\nFATAL ' + (e && e.message), 'utf8');
	  process.exitCode = 1;
});