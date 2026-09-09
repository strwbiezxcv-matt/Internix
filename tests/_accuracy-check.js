'use strict';
const BASE = 'http://localhost:3000';
async function j(path, opts) {
  const r = await fetch(BASE + path, opts);
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
}
(async () => {
  const login = await j('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student@demo.com', password: 'password123' })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const H = { headers: { cookie } };
  const prof = await j('/api/student/profile', H);
  const cat = await j('/api/catalog');

  async function topScore() {
    const rows = await j('/api/opportunities?program=BSIT', H);
    const w = rows.body.data.find((r) => r.opportunity.position.startsWith('Web Development'));
    return w.match.score;
  }

  const base = await topScore();
  console.log('base score (BSIT, HTML/CSS/JS/Git/React, Bulacan):', base);

  // 1. Remove a skill -> score must drop
  await j('/api/student/profile', { method: 'PUT', headers: { ...H.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: prof.body.data.full_name, programId: prof.body.data.program_id,
      preferredLocation: prof.body.data.preferred_location, workArrangement: prof.body.data.work_arrangement,
      skills: ['HTML', 'CSS', 'JavaScript'], interests: ['Web Development'] }) });
  console.log('after removing Git+React skills:', await topScore());

  // 2. Change location -> location component must change
  await j('/api/student/profile', { method: 'PUT', headers: { ...H.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: prof.body.data.full_name, programId: prof.body.data.program_id,
      preferredLocation: 'Davao', workArrangement: prof.body.data.work_arrangement,
      skills: ['HTML', 'CSS', 'JavaScript', 'Git'], interests: ['Web Development'] }) });
  console.log('after changing location to Davao:', await topScore());

  // 3. Change course -> course component must change
  const bsba = cat.body.data.programs.find((p) => p.code === 'BSBA');
  await j('/api/student/profile', { method: 'PUT', headers: { ...H.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: prof.body.data.full_name, programId: bsba.id,
      preferredLocation: 'Bulacan', workArrangement: prof.body.data.work_arrangement,
      skills: ['HTML', 'CSS', 'JavaScript', 'Git'], interests: ['Web Development'] }) });
  console.log('after changing course to BSBA:', await topScore());

  // restore
  await j('/api/student/profile', { method: 'PUT', headers: { ...H.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: prof.body.data.full_name, programId: prof.body.data.program_id,
      preferredLocation: prof.body.data.preferred_location, workArrangement: prof.body.data.work_arrangement,
      skills: prof.body.data.skills, interests: prof.body.data.interests }) });
  console.log('restored:', await topScore());
})().catch((e) => { console.error('FAIL', e); process.exit(1); });

