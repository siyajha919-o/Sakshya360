// Automatic CCTV occupancy check: every few minutes the next project's cameras are sampled
// (frame pulled from RTSP by the ML service), people are counted and compared with the register.
const { query, tx } = require('../db/pg');
const { rtspBaseUrl } = require('../config');
const evidence = require('./evidence');
const { audit } = require('./audit');
const ml = require('./ml');
const notify = require('./notify');

// One camera sees roughly a quarter of residents in a common area; below 35 % of that is suspicious.
function occupancyCheck(persons, registerCount) {
  const expected = Math.round(registerCount * 0.25 * 10) / 10;
  return { expected, suspicious: registerCount > 0 && persons < expected * 0.35 };
}

const PREFERRED = ['Activity Hall', 'Dormitory'];

async function tick() {
  // Next project: online cameras, least recently observed first.
  const next = (await query(`
    SELECT p.id, (SELECT count FROM attendance_daily d WHERE d.project_id = p.id ORDER BY day DESC LIMIT 1) AS register_count
    FROM projects p WHERE EXISTS (SELECT 1 FROM cameras c WHERE c.project_id = p.id AND c.online)
    ORDER BY (SELECT max(ts) FROM cctv_observations o WHERE o.project_id = p.id) NULLS FIRST, p.id LIMIT 1`)).rows[0];
  if (!next) return null;
  const cams = (await query('SELECT id, label, source FROM cameras WHERE project_id = $1 AND online ORDER BY id', [next.id])).rows
    .sort((a, b) => (PREFERRED.includes(b.label) ? 1 : 0) - (PREFERRED.includes(a.label) ? 1 : 0)).slice(0, 2);

  const out = [];
  for (const cam of cams) {
    let v;
    try {
      v = await ml.streamCount(`${rtspBaseUrl}/${cam.id}`);
    } catch (e) {
      out.push({ cameraId: cam.id, error: e.message });
      continue;
    }
    const registerCount = next.register_count || 0;
    const { expected, suspicious } = occupancyCheck(v.count, registerCount);
    // Simulated test-pattern cameras never show people, so they are recorded but never raise alerts.
    const actionable = suspicious && cam.source !== 'simulated';
    let evidenceId = null;
    if (actionable && v.jpeg_b64) {
      const buffer = Buffer.from(v.jpeg_b64, 'base64');
      evidenceId = await tx(async c => (await evidence.store(c, { buffer, size: buffer.length, mimetype: 'image/jpeg', originalname: `${cam.id}-auto.jpg` },
        { kind: 'cctv', projectId: next.id, userId: null })).id).catch(() => null);
    }
    await query(`INSERT INTO cctv_observations (camera_id, project_id, persons, register_count, expected, suspicious, evidence_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7)`, [cam.id, next.id, v.count, registerCount, expected, suspicious, evidenceId]);
    if (actionable) {
      const alerted = (await query(`SELECT 1 FROM audit_log WHERE action = 'CCTV_LOW_OCCUPANCY' AND detail->>'projectId' = $1 AND ts::date = CURRENT_DATE LIMIT 1`, [next.id])).rows.length;
      if (!alerted) {
        await audit({ id: 'SYSTEM', role: 'system' }, 'CCTV_LOW_OCCUPANCY', { projectId: next.id, cameraId: cam.id, persons: v.count, registerCount, evidenceId });
        await notify.alert({ sev: 'high', code: 'CCTV_LOW_OCCUPANCY', projectId: next.id, text: `${cam.label} camera shows ${v.count} people while the register claims ${registerCount}` });
      }
    }
    out.push({ cameraId: cam.id, persons: v.count, suspicious, simulated: cam.source === 'simulated' });
  }
  return { projectId: next.id, observations: out };
}

module.exports = { tick, occupancyCheck };
