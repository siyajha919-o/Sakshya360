// CCTV health: a camera is online when MediaMTX has its path ready, or when an RTSP DESCRIBE for it
// succeeds (this also covers on-demand sources). Two consecutive failures flip it offline, so a single
// dropped probe does not raise an alert.
const net = require('net');
const { query } = require('../db/pg');
const { mediamtxApiUrl, rtspBaseUrl } = require('../config');
const { invalidate } = require('./analytics');
const { audit } = require('./audit');
const notify = require('./notify');

const PROBES_PER_TICK = 8;
const PROBE_CONCURRENCY = 4;
const FAILS_TO_OFFLINE = 2;
const failures = new Map();
// Cameras whose state is expected to change (e.g. after a manual cut/restore) are probed first
// on every tick until the change is confirmed or they have been probed a few times.
const watched = new Map(); // id -> probes left
const watch = id => watched.set(id, 4);
const status = { mediaServer: 'unknown', lastRun: null, error: null };

function parseRtspStatus(text) {
  const m = /^RTSP\/1\.0 (\d{3})/.exec(text);
  return m ? Number(m[1]) : null;
}

function describe(path, timeoutMs = 12000) {
  const u = new URL(rtspBaseUrl);
  const url = `rtsp://${u.host}/${path}`;
  return new Promise(resolve => {
    const sock = net.connect({ host: u.hostname, port: Number(u.port) || 554 });
    let buf = '';
    const done = r => { sock.destroy(); resolve(r); };
    sock.setTimeout(timeoutMs, () => done({ ok: false, error: 'timeout' }));
    sock.on('error', e => done({ ok: false, error: e.code || e.message }));
    sock.on('connect', () => sock.write(`DESCRIBE ${url} RTSP/1.0\r\nCSeq: 1\r\nAccept: application/sdp\r\nUser-Agent: sakshya360-health\r\n\r\n`));
    sock.on('data', d => {
      buf += d.toString('latin1');
      if (buf.includes('\r\n\r\n')) {
        const code = parseRtspStatus(buf);
        done(code === 200 ? { ok: true } : { ok: false, error: `RTSP ${code || 'bad response'}` });
      }
    });
  });
}

async function readyPaths() {
  const res = await fetch(`${mediamtxApiUrl}/v3/paths/list?itemsPerPage=1000`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`MediaMTX API ${res.status}`);
  const body = await res.json();
  return new Set((body.items || []).filter(p => p.ready).map(p => p.name));
}

async function pool(items, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

async function apply(cam, ok, error) {
  if (ok) {
    failures.delete(cam.id);
    await query('UPDATE cameras SET online = TRUE, offline_since = NULL, last_seen = now(), last_checked = now(), last_error = NULL WHERE id = $1', [cam.id]);
    if (!cam.online) {
      await audit({ id: 'SYSTEM', role: 'system' }, 'CCTV_RESTORED', { cameraId: cam.id });
      await notify.alert({ sev: 'info', code: 'CCTV_RESTORED', projectId: cam.project_id, text: `${cam.label} camera back online` });
      return true;
    }
    return false;
  }
  const n = (failures.get(cam.id) || 0) + 1;
  failures.set(cam.id, n);
  await query('UPDATE cameras SET last_checked = now(), last_error = $2 WHERE id = $1', [cam.id, error]);
  if (cam.online && n >= FAILS_TO_OFFLINE) {
    await query('UPDATE cameras SET online = FALSE, offline_since = now() WHERE id = $1', [cam.id]);
    const { rows } = await query('SELECT COUNT(*) FILTER (WHERE NOT online)::int off, COUNT(*)::int total FROM cameras WHERE project_id = $1', [cam.project_id]);
    await audit({ id: 'SYSTEM', role: 'system' }, 'CCTV_OFFLINE', { cameraId: cam.id, error });
    await notify.alert({ sev: rows[0].off * 2 >= rows[0].total ? 'high' : 'med', code: 'CCTV_OFFLINE', projectId: cam.project_id,
      text: `${cam.label} camera went offline (${error}) – ${rows[0].off}/${rows[0].total} cameras down` });
    return true;
  }
  return false;
}

async function check() {
  let ready;
  try {
    ready = await readyPaths();
    status.mediaServer = 'up';
  } catch (e) {
    // Media server itself unreachable: say so, but do not mark every camera offline.
    status.mediaServer = 'down'; status.error = e.message; status.lastRun = new Date().toISOString();
    return { mediaServer: 'down', changed: 0 };
  }
  const cams = (await query('SELECT id, project_id, label, online FROM cameras ORDER BY last_checked NULLS FIRST, id')).rows;
  let changed = 0;
  for (const c of cams.filter(c => ready.has(c.id))) if (await apply(c, true)) changed++;
  // Cameras with a pending failure are re-probed first so outages are confirmed within one interval.
  const urgency = c => (watched.has(c.id) ? 100 : 0) + (failures.get(c.id) || 0);
  const toProbe = cams.filter(c => !ready.has(c.id)).sort((a, b) => urgency(b) - urgency(a)).slice(0, PROBES_PER_TICK);
  const results = await pool(toProbe, PROBE_CONCURRENCY, c => describe(c.id));
  for (let i = 0; i < toProbe.length; i++) {
    const c = toProbe[i];
    const flipped = await apply(c, results[i].ok, results[i].error);
    if (flipped) changed++;
    if (watched.has(c.id)) { const left = watched.get(c.id) - 1; if (flipped || left <= 0) watched.delete(c.id); else watched.set(c.id, left); }
  }
  if (changed) { invalidate(); notify.refresh('cctv'); }
  Object.assign(status, { lastRun: new Date().toISOString(), error: null, probed: toProbe.length, ready: ready.size });
  return { mediaServer: 'up', changed, probed: toProbe.length };
}

module.exports = { check, watch, status, parseRtspStatus, describe };
