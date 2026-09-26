// End-to-end check against a running stack (infra + ML + API, freshly seeded):
//   npm run api:reseed && npm run api   (in another terminal)   then   npm run test:e2e
// Talks HTTP to the API like the apps do; uses PostgreSQL directly only to set up edge cases.
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { pool } = require('../src/db/pg');

const BASE = (process.env.E2E_API || 'http://localhost:4000').replace(/\/$/, '');
let step = 0;
const ok = msg => console.log(`  ✔ ${++step}. ${msg}`);

async function http(path, { token, body, form, method, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { method: method || (body !== undefined || form ? 'POST' : 'GET'), headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const login = async email => {
  const r = await http('/api/login', { body: { email, password: 'demo@123' } });
  assert.equal(r.status, 200, `login ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
};

// Smallest valid JPEG (1x1) + random trailer so every upload has a unique SHA-256.
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const photo = () => new Blob([Buffer.concat([JPEG, Buffer.from([0xff, 0xd9]), crypto.randomBytes(16)])], { type: 'image/jpeg' });

(async () => {
  console.log(`Sakshya360 end-to-end test against ${BASE}`);
  const health = await http('/api/health');
  assert.equal(health.data.ok, true, 'API healthy (postgres + mongo)');
  assert.equal(health.data.ml.ok, true, 'ML service reachable');
  ok('health: postgres, mongo, ml up');

  const official = await login('official@dosje.gov.in');
  const state = await login('state.up@dosje.gov.in');
  const district = await login('district.lucknow@dosje.gov.in');
  const ngo = await login('p101@ngo.sakshya360.in');

  // ---- jurisdiction
  const all = (await http('/api/projects', { token: official })).data;
  const up = (await http('/api/projects', { token: state })).data;
  const lko = (await http('/api/projects', { token: district })).data;
  assert.equal(all.length, 8);
  assert.ok(up.every(p => p.state === 'Uttar Pradesh') && up.length >= 1);
  assert.ok(lko.every(p => p.district === 'Lucknow') && lko.length >= 1);
  assert.equal((await http('/api/projects/P102', { token: district })).status, 404);
  ok(`scope: official ${all.length}, state ${up.length}, district ${lko.length} projects; out-of-area project hidden`);

  // ---- tokens are not accepted in URLs
  assert.equal((await http(`/api/dashboard?token=${official}`)).status, 401);
  ok('session token in query string rejected');

  // ---- beneficiary OTP + in-app grievance
  const otp = await http('/api/auth/otp/request', { body: { phone: '+91 90000 00101' } });
  assert.ok(otp.data.devOtp, 'dev OTP returned (no SMS gateway)');
  assert.equal((await http('/api/auth/otp/verify', { body: { phone: '9000000101', code: '000000' === otp.data.devOtp ? '111111' : '000000' } })).status, 401);
  const ben = await http('/api/auth/otp/verify', { body: { phone: '9000000101', code: otp.data.devOtp } });
  assert.equal(ben.data.user.role, 'beneficiary');
  const g = await http('/api/feedback', { token: ben.data.token, body: { category: 'fake_attendance', present: true, servicesOk: false, rating: 1, text: 'e2e: register shows more people than stay here' } });
  assert.equal(g.status, 201);
  assert.equal((await http(`/api/feedback/${g.data.id}/respond`, { token: official, body: { status: 'resolved', response: 'Inspection ordered' } })).status, 200);
  const mine = (await http('/api/feedback/mine', { token: ben.data.token })).data;
  assert.equal(mine.find(x => x.id === g.data.id).response, 'Inspection ordered');
  assert.equal((await http('/api/dashboard', { token: ben.data.token })).status, 403);
  ok('beneficiary OTP login → grievance → official reply visible to beneficiary; beneficiary cannot see dashboard');

  // ---- anonymous QR feedback
  const qr = (await http('/api/projects/P101/feedback-qr', { token: official })).data;
  assert.ok(qr.svg.startsWith('<svg'));
  const t = new URL(qr.url).searchParams.get('t');
  assert.equal((await http(`/api/public/feedback/P101?t=${t}`)).data.project.id, 'P101');
  assert.equal((await http(`/api/public/feedback/P102?t=${t}`)).status, 403);
  assert.equal((await http(`/api/public/feedback/P101?t=${t}`, { body: { category: 'food', text: 'e2e: no dinner yesterday' } })).status, 201);
  ok('QR poster → anonymous feedback accepted; token bound to its project');

  // ---- random assignment → inspection report (offline-captured) → PDF + signed evidence
  await pool.query(`UPDATE assignments SET status = 'completed' WHERE status <> 'completed' AND project_id = 'P101'`);
  let assigned;
  for (let i = 0; i < 5 && !assigned; i++) {
    const batch = await http('/api/assignments/optimize', { token: official, body: { count: 8 } });
    assert.equal(batch.status, 200, JSON.stringify(batch.data));
    assigned = batch.data.solver.assignments.find(a => a.project_id === 'P101');
    if (!assigned) await pool.query(`UPDATE assignments SET status = 'completed' WHERE batch_id = $1`, [batch.data.batchId]);
  }
  assert.ok(assigned, 'P101 assigned');
  const inspector = await login(`${assigned.inspector_id.toLowerCase()}@pmu.sakshya360.in`);
  const duty = (await http('/api/assignments', { token: inspector })).data.find(a => a.project_id === 'P101' && a.status !== 'completed');
  const form = new FormData();
  form.append('data', JSON.stringify({
    assignmentId: duty.id, lat: duty.lat + 0.0003, lng: duty.lng, accuracy: 9, simulated: false,
    capturedAt: new Date(Date.now() - 2 * 3600e3).toISOString(),
    checklist: [{ item: 'Signboard with scheme name displayed', ok: true }, { item: 'CCTV cameras functional', ok: false }],
    headcount: 5, registerCount: 25, remarks: 'e2e',
  }));
  form.append('photos', photo(), 'p1.jpg');
  form.append('photos', photo(), 'p2.jpg');
  const rep = await http('/api/reports', { token: inspector, form });
  assert.equal(rep.status, 201, JSON.stringify(rep.data));
  assert.equal(rep.data.withinFence, true);
  assert.equal(rep.data.delayedSync, true);
  ok(`inspector ${assigned.inspector_id} filed report ${rep.data.id} on site; offline capture flagged as delayed sync`);

  const again = new FormData();
  again.append('data', JSON.stringify({ assignmentId: duty.id, lat: duty.lat, lng: duty.lng, checklist: [{ item: 'x', ok: true }], headcount: 1 }));
  again.append('photos', photo(), 'p.jpg');
  assert.equal((await http('/api/reports', { token: inspector, form: again })).status, 409);
  ok('re-submitting the same duty (offline queue retry) → 409, treated as already uploaded');

  const r = (await http('/api/reports', { token: official })).data.find(x => x.id === rep.data.id);
  const pdf = await http(r.pdfUrl, { raw: true });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  const ev = await http(r.evidence[0].url, { raw: true });
  assert.equal(ev.status, 200);
  assert.equal(ev.headers.get('x-evidence-sha256'), r.evidence[0].sha256);
  assert.equal((await http(r.evidence[0].url.replace(/sig=.{4}/, 'sig=AAAA'), { raw: true })).status, 401);
  assert.equal((await http(`/api/reports/${rep.data.id}/pdf`, { token: district, raw: true })).status, 200);
  assert.equal((await http(`/api/reports/${rep.data.id}/pdf`, { token: ngo, raw: true })).status, 403);
  ok('PDF export and evidence served via signed links; forged signature 401; NGO cannot open inspection PDF');

  // ---- overdue job
  const open = (await pool.query(`SELECT id FROM assignments WHERE status IN ('assigned','in_progress') LIMIT 1`)).rows[0];
  if (open) {
    await pool.query(`UPDATE assignments SET due_at = now() - interval '1 day' WHERE id = $1`, [open.id]);
    await http('/api/automation/run/overdue', { token: official, method: 'POST' });
    assert.equal((await pool.query('SELECT status FROM assignments WHERE id = $1', [open.id])).rows[0].status, 'overdue');
    ok(`overdue job marked ${open.id} overdue`);
  }

  // ---- automation settings: only the Division can change them
  assert.equal((await http('/api/automation', { token: state, method: 'PUT', body: { autoAssign: { count: 9 } } })).status, 403);
  const au = await http('/api/automation', { token: official, method: 'PUT', body: { autoAssign: { hour: 10, minute: 30 } } });
  assert.equal(au.data.settings.autoAssign.hour, 10);
  ok('automation schedule editable by Division only');

  // ---- camera health (needs MediaMTX)
  const h = await http('/api/automation/run/cameraHealth', { token: official, method: 'POST' });
  if (h.data.camera && h.data.camera.mediaServer === 'up') {
    await http('/api/cctv/P101_2/simulate-outage', { token: official, body: { down: true } });
    // A stream started by an earlier probe keeps running 15 s after its last reader (runOnDemandCloseAfter),
    // exactly as in production where checks are 60 s apart; wait it out, then two failed probes flip it offline.
    await new Promise(r => setTimeout(r, 20000));
    for (let i = 0; i < 2; i++) await http('/api/automation/run/cameraHealth', { token: official, method: 'POST' });
    const cam = (await http('/api/cctv/cameras?projectId=P101', { token: official })).data.find(c => c.id === 'P101_2');
    await http('/api/cctv/P101_2/simulate-outage', { token: official, body: { down: false } });
    assert.equal(cam.online, false, `P101_2 should be offline, last_error=${cam.last_error}`);
    ok(`camera health: simulated outage on P101_2 detected (${cam.last_error})`);
    const w = await http('/api/automation/run/cctvWatch', { token: official, method: 'POST' });
    ok(`CCTV watch ran: ${JSON.stringify(w.data.runs.cctvWatch && w.data.runs.cctvWatch.detail)}`);
  } else {
    console.log('  – camera health skipped: media server not reachable');
  }

  // ---- ML retraining export + audit chain
  const exp = await http('/api/analytics/training-export', { token: official, raw: true });
  assert.equal(exp.status, 200);
  const lines = (await exp.text()).trim().split('\n').filter(Boolean);
  ok(`training export: ${lines.length} labelled real snapshot(s)`);
  assert.equal((await http('/api/audit/verify', { token: official })).data.ok, true);
  ok('audit hash chain intact');

  console.log(`\nAll ${step} end-to-end checks passed.`);
  await pool.end();
})().catch(async e => {
  console.error(`\n✖ step ${step + 1} failed:`, e.message);
  await pool.end().catch(() => {});
  process.exit(1);
});
