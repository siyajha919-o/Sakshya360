// Demo data without a phone: files realistic inspection reports through the real /api/reports pipeline
// (geofence check, SHA-256 evidence, signature, alerts, audit) using synthetic watermarked site photos
// drawn by the ML service. Disabled in production.
const crypto = require('crypto');
const { query } = require('../db/pg');
const config = require('../config');
const { sign } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');

const CHECKLIST = [
  'Signboard with scheme name displayed', 'Beneficiary register maintained & signed', 'Biometric / face attendance in use',
  'Kitchen & toilets hygienic', 'Food served as per menu', 'Staff present as per sanctioned posts',
  'Grievance box / helpline displayed', 'CCTV cameras functional', 'Fire safety & first-aid available', 'Fund utilisation records available',
];

// Three situations an official should see: a clean visit, proxy attendance, and a report filed from elsewhere.
const SCENARIOS = [
  { projectId: 'P101', dLat: 0.0003, dLng: 0.0002, headcount: 23, fails: [6], hoursAgo: 0, people: 9,
    remarks: 'Centre functioning well. Counselling session in progress, register matches residents present.' },
  { projectId: 'P103', dLat: 0.0004, dLng: 0.0003, headcount: 14, registerCount: 40, fails: [1, 2, 5, 7], hoursAgo: 3, people: 5,
    remarks: 'Only 14 residents present against 40 in the register. Register entries identical for weeks. Two cameras disconnected. Captured offline – no mobile network at site.' },
  { projectId: 'P108', dLat: 0.11, dLng: 0.02, headcount: 30, fails: [], hoursAgo: 0, people: 12,
    remarks: 'All in order.' },
];

const stamp = d => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST';

function haversine(a, b) {
  const r = x => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

async function photo(body) {
  const res = await fetch(`${config.mlUrl}/demo/photo`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new HttpError(503, 'ML service unavailable – start it with `npm run ml`');
  return Buffer.from(await res.arrayBuffer());
}

// An open duty for the project, or a new one for an eligible inspector (not from the project's state).
async function dutyFor(p) {
  const open = (await query(`SELECT a.id, u.id AS inspector_id, u.name FROM assignments a JOIN users u ON u.id = a.inspector_id
                              WHERE a.project_id = $1 AND a.status <> 'completed' LIMIT 1`, [p.id])).rows[0];
  if (open) return open;
  const insp = (await query(`SELECT id, name FROM users WHERE role = 'inspector' AND state <> $1
                             ORDER BY ST_Distance(base_location, (SELECT location FROM projects WHERE id = $2)) LIMIT 1`, [p.state, p.id])).rows[0];
  const id = 'A' + crypto.randomBytes(6).toString('hex');
  await query(`INSERT INTO assignments (id, project_id, inspector_id, due_at, batch_id, solver)
               VALUES ($1,$2,$3, now() + interval '3 days', 'DEMO', '{"trigger":"demo"}')`, [id, p.id, insp.id]);
  return { id, inspector_id: insp.id, name: insp.name };
}

async function createDemoReports() {
  if (config.production) throw new HttpError(404, 'Not available in production');
  const created = [];
  for (const sc of SCENARIOS) {
    const p = (await query(`SELECT id, name, scheme, ngo, district, state, ST_Y(location::geometry) lat, ST_X(location::geometry) lng,
                                   (SELECT count FROM attendance_daily d WHERE d.project_id = projects.id ORDER BY day DESC LIMIT 1) AS register
                            FROM projects WHERE id = $1`, [sc.projectId])).rows[0];
    if (!p) continue;
    const duty = await dutyFor(p);
    const pos = { lat: p.lat + sc.dLat, lng: p.lng + sc.dLng };
    const dist = haversine(pos, p);
    const at = new Date(Date.now() - sc.hoursAgo * 3600e3);

    const form = new FormData();
    const views = ['front', 'hall', 'front'];
    for (let i = 0; i < views.length; i++) {
      const t = new Date(at.getTime() + i * 90e3);
      const jpg = await photo({
        title: p.name, subtitle: `${p.scheme} Scheme - ${p.ngo} - ${p.district}`, people: i === 1 ? sc.people : Math.max(2, sc.people - 3),
        seed: Number(p.id.slice(1)) * 10 + i + Date.now() % 1000, view: views[i],
        lines: [
          `Sakshya360 - DoSJE surprise inspection - ${p.id}`,
          `${p.name}, ${p.district}`,
          `GPS ${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)} +-8 m - ${dist > 5000 ? (dist / 1000).toFixed(1) + ' km' : dist + ' m'} from site`,
          `${stamp(t)} - ${duty.name} - ${duty.id}`,
        ],
      });
      form.append('photos', new Blob([jpg], { type: 'image/jpeg' }), `photo-${i + 1}.jpg`);
    }
    form.append('data', JSON.stringify({
      assignmentId: duty.id, lat: pos.lat, lng: pos.lng, accuracy: 8, simulated: false, capturedAt: at.toISOString(),
      checklist: CHECKLIST.map((item, i) => ({ item, ok: !sc.fails.includes(i) })),
      headcount: sc.headcount, registerCount: sc.registerCount ?? p.register ?? undefined, remarks: sc.remarks,
    }));

    // Submit as the inspector through the public API, exactly like the mobile app.
    const token = sign({ id: duty.inspector_id, role: 'inspector', name: duty.name }, '5m');
    const res = await fetch(`http://127.0.0.1:${config.port}/api/reports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status, `Demo report for ${p.id} failed: ${body.error || res.status}`);
    created.push({ reportId: body.id, projectId: p.id, inspector: duty.name, withinFence: body.withinFence, score: body.score });
  }
  return created;
}

module.exports = { createDemoReports };
