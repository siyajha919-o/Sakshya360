// Sakshya360 API server + static frontend host. Zero npm dependencies (Node >= 22.5).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const store = require('./db');
const ml = require('./ml-client');

const { db } = store;
const PORT = +process.env.PORT || 3000;
const FRONTEND = path.join(__dirname, '..', 'frontend');
const UPLOADS = path.join(store.DATA_DIR, 'uploads');
const GEOFENCE_M = 250;
const MAX_BODY = 20 * 1024 * 1024;

// ---------- helpers ----------
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const uid = prefix => prefix + Date.now().toString(36) + crypto.randomBytes(3).toString('hex');
const secureRandom = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function haversineM(a, b, c, d) {
  const r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

// Tamper-evident audit trail: each entry's hash covers the previous hash.
function audit(user, action, detail) {
  const last = db.prepare('SELECT hash FROM audit ORDER BY id DESC LIMIT 1').get();
  const prev = last ? last.hash : 'GENESIS';
  const ts = Date.now();
  const hash = sha256(prev + JSON.stringify([ts, user.userId, user.role, action, detail]));
  db.prepare('INSERT INTO audit (ts, actor, role, action, detail, prev_hash, hash) VALUES (?,?,?,?,?,?,?)').run(ts, user.userId, user.role, action, detail, prev, hash);
}

// Saves a base64 data URL image; returns its SHA-256 (the evidence fingerprint) and file name.
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new HttpError(400, 'Invalid image');
  const buf = Buffer.from(m[2], 'base64');
  const hash = sha256(buf);
  const file = `${hash}.${m[1] === 'png' ? 'png' : 'jpg'}`;
  const full = path.join(UPLOADS, file);
  if (!fs.existsSync(full)) fs.writeFileSync(full, buf);
  return { hash, file };
}

// Live signals per project that feed the ML model.
function signals(projectId) {
  const geoFails = db.prepare('SELECT COUNT(*) n FROM reports WHERE project_id = ? AND geo_ok = 0').get(projectId).n;
  const vcFails = db.prepare("SELECT COUNT(*) n FROM vc_calls WHERE project_id = ? AND outcome IS NOT NULL AND outcome <> 'Verified'").get(projectId).n;
  const last = db.prepare('SELECT headcount, register_count FROM reports WHERE project_id = ? ORDER BY ts DESC LIMIT 1').get(projectId);
  return { geoFails, vcFails, headcount: last ? last.headcount : null, registerCount: last ? last.register_count : null };
}

async function scoredProjects(ids) {
  const list = store.projects().filter(p => !ids || ids.includes(p.id));
  const scores = await ml.scoreCentres(list.map(p => ml.toCentre(p, signals(p.id))));
  return list.map((p, i) => {
    const a = p.attendance;
    const avg = Math.round(a.reduce((s, x) => s + x, 0) / a.length);
    return { ...p, analysis: { ...scores[i], avg, occupancy: Math.round(avg / p.sanctioned * 100) } };
  });
}

const reportRow = r => ({
  id: r.id, assignmentId: r.assignment_id, projectId: r.project_id, inspectorId: r.inspector_id, ts: r.ts,
  lat: r.lat, lng: r.lng, accuracy: r.accuracy, distanceM: r.distance_m, geoOk: !!r.geo_ok, simulated: !!r.simulated,
  checklist: JSON.parse(r.checklist), score: r.score, headcount: r.headcount, registerCount: r.register_count,
  remarks: r.remarks, signature: r.signature,
  photos: db.prepare('SELECT hash, file, ts FROM photos WHERE report_id = ?').all(r.id).map(ph => ({ hash: ph.hash, url: '/uploads/' + ph.file })),
  projectName: (store.project(r.project_id) || {}).name, inspectorName: (store.inspector(r.inspector_id) || {}).name,
});

const assignmentRow = a => {
  const p = store.project(a.project_id), i = store.inspector(a.inspector_id);
  return { id: a.id, projectId: a.project_id, inspectorId: a.inspector_id, created: a.created, due: a.due, status: a.status, seed: a.seed,
    project: p && { id: p.id, name: p.name, scheme: p.scheme, ngo: p.ngo, district: p.district, state: p.state, lat: p.lat, lng: p.lng, register: p.attendance[p.attendance.length - 1] },
    inspectorName: i && i.name, distanceKm: p && i ? Math.round(haversineM(i.lat, i.lng, p.lat, p.lng) / 1000) : null };
};

// ---------- random assignment engine ----------
async function runLottery(user, count) {
  const log = [];
  const seed = crypto.randomInt(0, 2 ** 32);
  log.push(`Lottery seed: ${seed} (recorded in audit trail)`);
  const busy = new Set(db.prepare("SELECT project_id FROM assignments WHERE status <> 'Completed'").all().map(r => r.project_id));
  const scored = await scoredProjects();
  const pool = scored.filter(p => !busy.has(p.id)).map(p => ({ p, w: 10 + p.analysis.risk + Math.min(p.lastInspectedDaysAgo, 120) / 4 }));
  const inspectors = store.inspectors();
  const created = [];

  for (let n = 0; n < count && pool.length; n++) {
    const total = pool.reduce((s, x) => s + x.w, 0);
    let r = secureRandom() * total, k = 0;
    while (k < pool.length - 1 && r > pool[k].w) { r -= pool[k].w; k++; }
    const { p, w } = pool.splice(k, 1)[0];
    log.push(`\n▶ ${p.id} ${p.name} (${p.state}) – ML risk ${p.analysis.risk}, weight ${w.toFixed(1)}/${total.toFixed(1)}`);

    const cands = inspectors.map(i => {
      const reasons = [];
      if (i.homeState === p.state) reasons.push('home state (conflict of interest)');
      if (db.prepare('SELECT 1 FROM reports WHERE project_id = ? AND inspector_id = ?').get(p.id, i.id)) reasons.push('inspected before');
      if (i.load >= 3) reasons.push('workload cap');
      const km = haversineM(i.lat, i.lng, p.lat, p.lng) / 1000;
      return { i, km, reasons, score: reasons.length ? 0 : (1 / (1 + i.load)) / Math.sqrt(1 + km / 100) };
    });
    cands.forEach(c => log.push(`   ${c.i.name.padEnd(15)} ${String(Math.round(c.km)).padStart(5)} km  ${c.reasons.length ? '✗ ' + c.reasons.join(', ') : 'score ' + c.score.toFixed(3)}`));
    const ok = cands.filter(c => c.score > 0);
    if (!ok.length) { log.push('   ⚠ No eligible inspector – escalated to Division'); continue; }
    const tot = ok.reduce((s, c) => s + c.score, 0);
    let rr = secureRandom() * tot, j = 0;
    while (j < ok.length - 1 && rr > ok[j].score) { rr -= ok[j].score; j++; }
    const chosen = ok[j].i;
    chosen.load++;
    db.prepare('UPDATE inspectors SET load = load + 1 WHERE id = ?').run(chosen.id);
    const due = Date.now() + (1 + crypto.randomInt(0, 5)) * 86400000;
    const id = uid('A');
    db.prepare('INSERT INTO assignments VALUES (?,?,?,?,?,?,?)').run(id, p.id, chosen.id, Date.now(), due, 'Assigned', seed);
    created.push(id);
    log.push(`   ✓ Assigned to ${chosen.name}. Surprise visit – site NOT notified.`);
    audit(user, 'ASSIGN', `${p.id} -> ${chosen.id} seed=${seed}`);
  }
  return { created: created.length, log: log.join('\n') };
}

// ---------- routing ----------
const DEMO_USERS = { official: 'OFF-DoSJE-01', inspector: 'I01', ngo: 'P101' };
const routes = [];
const route = (method, pattern, roles, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, roles, handler });
};

route('GET', '/api/health', null, async () => ({ ok: true, ml: await ml.health() }));

route('POST', '/api/login', null, async ({ body }) => {
  // Demo login. Production: Parichay / Jan Parichay SSO + device binding.
  const role = body.role;
  if (!DEMO_USERS[role]) throw new HttpError(400, 'Unknown role');
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(token, role, DEMO_USERS[role], Date.now());
  const user = { role, userId: DEMO_USERS[role] };
  audit(user, 'LOGIN', role);
  return { token, ...user };
});

route('GET', '/api/me', ['official', 'inspector', 'ngo'], async ({ user }) => {
  const profile = user.role === 'inspector' ? store.inspector(user.userId) : user.role === 'ngo' ? store.project(user.userId) : { name: 'DoSJE Monitoring Cell' };
  return { ...user, profile };
});

route('GET', '/api/projects', ['official'], () => scoredProjects());
route('GET', '/api/projects/:id', ['official'], async ({ params }) => {
  const [p] = await scoredProjects([params.id]);
  if (!p) throw new HttpError(404, 'Project not found');
  return p;
});

route('GET', '/api/dashboard', ['official'], async () => {
  const list = await scoredProjects();
  const cams = list.flatMap(p => p.cameras);
  return {
    projects: list.length,
    camerasOnline: cams.filter(c => c.online).length, camerasTotal: cams.length,
    highAlerts: list.reduce((s, p) => s + p.analysis.flags.filter(f => f.sev === 'high').length, 0),
    openAssignments: db.prepare("SELECT COUNT(*) n FROM assignments WHERE status <> 'Completed'").get().n,
    mlSource: list[0] ? list[0].analysis.source : null,
  };
});

route('GET', '/api/inspectors', ['official'], () => store.inspectors());

route('GET', '/api/assignments', ['official', 'inspector'], ({ user }) => {
  const rows = user.role === 'inspector'
    ? db.prepare('SELECT * FROM assignments WHERE inspector_id = ? ORDER BY created DESC').all(user.userId)
    : db.prepare('SELECT * FROM assignments ORDER BY created DESC').all();
  return rows.map(assignmentRow);
});

route('POST', '/api/assignments/lottery', ['official'], ({ user, body }) => runLottery(user, Math.max(1, Math.min(8, +body.count || 1))));

route('POST', '/api/assignments/request', ['inspector'], ({ user }) => {
  // Demo helper: Division assigns one random, conflict-free site to this inspector.
  const me = store.inspector(user.userId);
  const busy = new Set(db.prepare("SELECT project_id FROM assignments WHERE status <> 'Completed'").all().map(r => r.project_id));
  const options = store.projects().filter(p => p.state !== me.homeState && !busy.has(p.id));
  if (!options.length) throw new HttpError(409, 'No eligible project available');
  const p = options[crypto.randomInt(0, options.length)];
  const id = uid('A');
  db.prepare('INSERT INTO assignments VALUES (?,?,?,?,?,?,?)').run(id, p.id, me.id, Date.now(), Date.now() + 2 * 86400000, 'Assigned', null);
  db.prepare('UPDATE inspectors SET load = load + 1 WHERE id = ?').run(me.id);
  audit(user, 'ASSIGN', `${p.id} -> ${me.id} (on request)`);
  return assignmentRow(db.prepare('SELECT * FROM assignments WHERE id = ?').get(id));
});

route('GET', '/api/reports', ['official', 'inspector'], ({ user }) => {
  const rows = user.role === 'inspector'
    ? db.prepare('SELECT * FROM reports WHERE inspector_id = ? ORDER BY ts DESC').all(user.userId)
    : db.prepare('SELECT * FROM reports ORDER BY ts DESC').all();
  return rows.map(reportRow);
});

route('POST', '/api/reports', ['inspector'], ({ user, body }) => {
  const a = db.prepare('SELECT * FROM assignments WHERE id = ?').get(body.assignmentId);
  if (!a || a.inspector_id !== user.userId) throw new HttpError(404, 'Assignment not found');
  if (a.status === 'Completed') throw new HttpError(409, 'Already reported');
  const p = store.project(a.project_id);
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') throw new HttpError(400, 'Location required');
  if (!Array.isArray(body.photos) || !body.photos.length) throw new HttpError(400, 'At least one live photo required');
  if (!Number.isInteger(body.headcount) || body.headcount < 0) throw new HttpError(400, 'Headcount required');

  const saved = body.photos.map(saveImage);
  const dup = saved.find(s => db.prepare('SELECT 1 FROM photos WHERE hash = ?').get(s.hash));
  if (dup) throw new HttpError(409, 'Duplicate photo – evidence already used in another report');
  if (new Set(saved.map(s => s.hash)).size !== saved.length) throw new HttpError(409, 'Same photo submitted twice');

  const checklist = (body.checklist || []).map(Boolean);
  const distance = haversineM(body.lat, body.lng, p.lat, p.lng);
  const r = {
    id: uid('R'), ts: Date.now(), distance, geoOk: distance <= GEOFENCE_M,
    score: checklist.length ? Math.round(checklist.filter(Boolean).length / checklist.length * 100) : 0,
  };
  const registerCount = Number.isInteger(body.registerCount) ? body.registerCount : p.attendance[p.attendance.length - 1];
  const signature = sha256(JSON.stringify([r.id, a.id, user.userId, body.lat, body.lng, checklist, body.headcount, registerCount, body.remarks, saved.map(s => s.hash)]));

  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
      r.id, a.id, p.id, user.userId, r.ts, body.lat, body.lng, body.accuracy || null, distance, r.geoOk ? 1 : 0, body.simulated ? 1 : 0,
      JSON.stringify(checklist), r.score, body.headcount, registerCount, String(body.remarks || '').slice(0, 2000), signature);
    saved.forEach(s => db.prepare('INSERT INTO photos VALUES (?,?,?,?,?,?)').run(s.hash, r.id, s.file, r.ts, body.lat, body.lng));
    db.prepare("UPDATE assignments SET status = 'Completed' WHERE id = ?").run(a.id);
    db.prepare('UPDATE projects SET last_inspected_days_ago = 0 WHERE id = ?').run(p.id);
    db.prepare('UPDATE inspectors SET load = MAX(0, load - 1) WHERE id = ?').run(user.userId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  audit(user, 'REPORT_SUBMIT', `${p.id} score=${r.score} geoOk=${r.geoOk} sig=${signature.slice(0, 16)}`);
  return reportRow(db.prepare('SELECT * FROM reports WHERE id = ?').get(r.id));
});

route('POST', '/api/vc', ['official', 'ngo'], ({ user, body }) => {
  const projectId = user.role === 'ngo' ? user.userId : body.projectId;
  const list = store.projects();
  const p = projectId ? store.project(projectId) : list[crypto.randomInt(0, list.length)];
  if (!p) throw new HttpError(404, 'Project not found');
  const person = p.staff[crypto.randomInt(0, p.staff.length)];
  const id = uid('V');
  db.prepare('INSERT INTO vc_calls (id, project_id, person, started, caller) VALUES (?,?,?,?,?)').run(id, p.id, `${person.name} (${person.role})`, Date.now(), user.userId);
  audit(user, 'VC_START', `${p.id} ${person.role}`);
  return { id, project: { id: p.id, name: p.name, district: p.district }, person };
});

route('POST', '/api/vc/:id/finish', ['official', 'ngo'], ({ user, params, body }) => {
  const call = db.prepare('SELECT * FROM vc_calls WHERE id = ?').get(params.id);
  if (!call) throw new HttpError(404, 'Call not found');
  if (call.outcome) throw new HttpError(409, 'Call already closed');
  const checks = Math.max(0, Math.min(4, +body.checks || 0));
  const outcome = body.verified ? (checks >= 3 ? 'Verified' : 'Partially verified') : 'Flagged – suspicious';
  db.prepare('UPDATE vc_calls SET ended = ?, outcome = ?, checks = ? WHERE id = ?').run(Date.now(), outcome, checks, call.id);
  audit(user, 'VC_RESULT', `${call.project_id} ${outcome}`);
  return { outcome };
});

route('GET', '/api/vc', ['official', 'ngo'], ({ user }) => {
  const rows = user.role === 'ngo'
    ? db.prepare('SELECT * FROM vc_calls WHERE project_id = ? AND outcome IS NOT NULL ORDER BY started DESC').all(user.userId)
    : db.prepare('SELECT * FROM vc_calls WHERE outcome IS NOT NULL ORDER BY started DESC').all();
  return rows.map(v => ({ id: v.id, projectId: v.project_id, projectName: (store.project(v.project_id) || {}).name, person: v.person, ts: v.started, duration: Math.round((v.ended - v.started) / 1000), outcome: v.outcome }));
});

route('POST', '/api/checkins', ['ngo'], ({ user, body }) => {
  const p = store.project(user.userId);
  if (typeof body.lat !== 'number' || typeof body.lng !== 'number') throw new HttpError(400, 'Location required');
  if (!p.staff.some(s => s.name === body.who)) throw new HttpError(400, 'Unknown person');
  const { hash } = saveImage(body.selfie);
  const distance = haversineM(body.lat, body.lng, p.lat, p.lng);
  const ok = distance <= GEOFENCE_M;
  db.prepare('INSERT INTO checkins (project_id, who, ts, distance_m, ok, simulated, selfie_hash) VALUES (?,?,?,?,?,?,?)').run(p.id, body.who, Date.now(), distance, ok ? 1 : 0, body.simulated ? 1 : 0, hash);
  audit(user, 'ATTENDANCE', `${p.id} ${body.who} ok=${ok}`);
  return { ok, distanceM: distance };
});

route('GET', '/api/checkins', ['ngo'], ({ user }) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return db.prepare('SELECT who, ts, distance_m, ok FROM checkins WHERE project_id = ? AND ts >= ? ORDER BY ts DESC').all(user.userId, start.getTime())
    .map(c => ({ who: c.who, ts: c.ts, distanceM: c.distance_m, ok: !!c.ok }));
});

route('POST', '/api/cctv/headcount', ['official'], async ({ body }) => {
  const p = store.project(body.projectId);
  if (!p) throw new HttpError(404, 'Project not found');
  const register = p.attendance[p.attendance.length - 1];
  return { register, ...(await ml.headcount({ detected_persons: Math.max(0, +body.detected || 0), register_count: register, camera_coverage: 0.25 })) };
});

route('POST', '/api/cctv/snapshot', ['official'], ({ user, body }) => {
  const { hash } = saveImage(body.frame);
  audit(user, 'CCTV_SNAPSHOT', `${body.cameraId} sha256=${hash.slice(0, 16)}`);
  return { hash };
});

route('GET', '/api/analytics', ['official'], async () => ({ projects: await scoredProjects(), model: await ml.metrics() }));

route('GET', '/api/audit', ['official'], () => db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 50').all());
route('GET', '/api/audit/verify', ['official'], () => {
  let prev = 'GENESIS', n = 0;
  for (const e of db.prepare('SELECT * FROM audit ORDER BY id').iterate()) {
    const expected = sha256(prev + JSON.stringify([e.ts, e.actor, e.role, e.action, e.detail]));
    if (e.prev_hash !== prev || e.hash !== expected) return { ok: false, brokenAt: e.id, checked: n };
    prev = e.hash; n++;
  }
  return { ok: true, checked: n };
});

// ---------- server ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };

function serveStatic(res, root, rel) {
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Payload too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (!url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/uploads/')) return serveStatic(res, UPLOADS, path.basename(url.pathname));
    return serveStatic(res, FRONTEND, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
  }

  for (const r of routes) {
    const m = r.method === req.method && r.re.exec(url.pathname);
    if (!m) continue;
    try {
      let user = null;
      if (r.roles) {
        const token = (req.headers.authorization || '').replace(/^Bearer /, '');
        const s = token && db.prepare('SELECT role, user_id FROM sessions WHERE token = ?').get(token);
        if (!s) throw new HttpError(401, 'Not signed in');
        if (!r.roles.includes(s.role)) throw new HttpError(403, 'Not permitted for this role');
        user = { role: s.role, userId: s.user_id };
      }
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const body = req.method === 'POST' ? await readBody(req) : {};
      return send(200, await r.handler({ req, user, params, body, query: url.searchParams }));
    } catch (e) {
      if (!e.status) console.error(e);
      return send(e.status || 500, { error: e.status ? e.message : 'Internal error' });
    }
  }
  send(404, { error: 'No such endpoint' });
}).listen(PORT, () => console.log(`Sakshya360 API + app on http://localhost:${PORT}`));
