// CCTV: WebRTC (WHEP) signalling proxy to MediaMTX, OpenCV frame analysis, camera health.
const fs = require('fs');
const path = require('path');
const { Router, text } = require('express');
const multer = require('multer');
const { query, tx } = require('../db/pg');
const { mediamtxUrl, cameraOutageDir } = require('../config');
const { requireRole, requireMonitor, scopeClause, inScope } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const evidence = require('../services/evidence');
const { audit } = require('../services/audit');
const { occupancyCheck } = require('../services/cctvWatch');
const cameraHealth = require('../services/cameraHealth');
const ml = require('../services/ml');

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

async function cameraInScope(user, id) {
  const cam = (await query('SELECT c.*, p.state, p.district, p.name AS project_name FROM cameras c JOIN projects p ON p.id = c.project_id WHERE c.id = $1', [id])).rows[0];
  if (!cam) throw new HttpError(404, 'Camera not found');
  if (!inScope(user, cam)) throw new HttpError(403, 'Camera outside your jurisdiction');
  return cam;
}

r.get('/cctv/cameras', requireMonitor, async (req, res) => {
  const params = [];
  let where = scopeClause(req.user, params).sql;
  if (req.query.projectId) { params.push(req.query.projectId); where += ` AND c.project_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT c.id, c.project_id, p.name AS project_name, p.district, p.state, c.label, c.online, c.source, c.last_seen, c.last_checked, c.offline_since, c.last_error,
            (SELECT row_to_json(o) FROM (SELECT ts, persons, expected, suspicious FROM cctv_observations x WHERE x.camera_id = c.id ORDER BY ts DESC LIMIT 1) o) AS last_observation
     FROM cameras c JOIN projects p ON p.id = c.project_id WHERE ${where} ORDER BY c.id`, params);
  res.json(rows);
});

r.get('/cctv/health', requireMonitor, async (_req, res) => res.json(cameraHealth.status));

// Browser sends an SDP offer (ICE gathered), we forward to MediaMTX and return its SDP answer.
r.post('/cctv/:id/whep', requireMonitor, text({ type: ['application/sdp', 'text/plain'], limit: '100kb' }), async (req, res) => {
  const cam = await cameraInScope(req.user, req.params.id);
  if (!cam.online) throw new HttpError(503, 'Camera offline');
  if (typeof req.body !== 'string' || !req.body.startsWith('v=0')) throw new HttpError(400, 'SDP offer required');
  let upstream;
  try {
    upstream = await fetch(`${mediamtxUrl}/${encodeURIComponent(cam.id)}/whep`, {
      method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: req.body, signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    throw new HttpError(502, `Media server unreachable: ${e.message}`);
  }
  const answer = await upstream.text();
  if (!upstream.ok) throw new HttpError(upstream.status === 404 ? 503 : 502, `Stream unavailable (${upstream.status})`);
  await query('UPDATE cameras SET last_seen = now() WHERE id = $1', [cam.id]);
  res.status(201).type('application/sdp').send(answer);
});

// Frame grabbed from the live player → OpenCV person detection → compare with today's register.
r.post('/cctv/:id/analyze', requireMonitor, upload.single('frame'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Frame required');
  const cam = await cameraInScope(req.user, req.params.id);
  const vision = await ml.countPeople(req.file.buffer);
  const register = (await query('SELECT count FROM attendance_daily WHERE project_id = $1 ORDER BY day DESC LIMIT 1', [cam.project_id])).rows[0];
  const registerCount = register ? register.count : 0;
  const { expected: expectedVisible, suspicious } = occupancyCheck(vision.count, registerCount);

  let evidenceId = null;
  if (req.body.save === 'true') {
    evidenceId = await tx(async c => (await evidence.store(c, { ...req.file, mimetype: 'image/jpeg' }, { kind: 'cctv', projectId: cam.project_id, userId: req.user.id })).id);
    await audit(req.user, 'CCTV_SNAPSHOT', { cameraId: cam.id, evidenceId, persons: vision.count });
  }
  res.json({ cameraId: cam.id, persons: vision.count, boxes: vision.boxes, detector: vision.detector, registerCount, expectedVisible, suspicious, evidenceId });
});

// Demo control: cut / restore a simulated camera's feed. MediaMTX refuses to start a simulated source
// while a marker file exists (infra/mediamtx.yml), so the real health check detects the outage.
r.post('/cctv/:id/simulate-outage', requireRole('official'), async (req, res) => {
  const cam = await cameraInScope(req.user, req.params.id);
  if (cam.source !== 'simulated') throw new HttpError(400, 'Only simulated cameras can be switched off from here');
  fs.mkdirSync(cameraOutageDir, { recursive: true });
  const marker = path.join(cameraOutageDir, cam.id);
  const down = !!req.body.down;
  if (down) fs.writeFileSync(marker, new Date().toISOString());
  else fs.rmSync(marker, { force: true });
  await audit(req.user, 'CCTV_SIMULATE_OUTAGE', { cameraId: cam.id, down });
  // A feed that is being watched keeps running until its viewers leave (+15 s), then probes fail.
  // Prioritise this camera in the next health checks so the change shows up within about a minute.
  cameraHealth.watch(cam.id);
  res.json({ cameraId: cam.id, down });
});

module.exports = r;
