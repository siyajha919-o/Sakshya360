// Face + geofence verified attendance. Face embeddings come from OpenCV (YuNet + SFace) in the ML service.
const { Router } = require('express');
const multer = require('multer');
const { query, tx } = require('../db/pg');
const { requireRole } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const evidence = require('../services/evidence');
const { invalidate } = require('../services/analytics');
const { audit } = require('../services/audit');
const notify = require('../services/notify');
const ml = require('../services/ml');

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const ngo = requireRole('ngo');

r.get('/attendance/people', ngo, async (req, res) => {
  const { rows } = await query(
    `SELECT pe.id, pe.name, pe.kind, pe.face_enrolled_at IS NOT NULL AS face_enrolled,
            (SELECT row_to_json(x) FROM (SELECT k.ts, k.accepted FROM checkins k WHERE k.person_id = pe.id AND k.ts::date = CURRENT_DATE ORDER BY k.ts DESC LIMIT 1) x) AS today
     FROM people pe WHERE pe.project_id = $1 ORDER BY pe.id`, [req.user.projectId]);
  const site = (await query('SELECT id, name, district, geofence_m, ST_Y(location::geometry) lat, ST_X(location::geometry) lng FROM projects WHERE id = $1', [req.user.projectId])).rows[0];
  res.json({ site, people: rows });
});

r.post('/attendance/enroll/:personId', ngo, upload.single('image'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Face image required');
  const person = (await query('SELECT id FROM people WHERE id = $1 AND project_id = $2', [req.params.personId, req.user.projectId])).rows[0];
  if (!person) throw new HttpError(404, 'Person not found');
  const { embedding, faces } = await ml.faceEmbed(req.file.buffer);
  if (faces !== 1) throw new HttpError(422, faces ? 'Multiple faces in frame – enrol one person at a time' : 'No face detected');
  await query('UPDATE people SET face_embedding = $1, face_enrolled_at = now() WHERE id = $2', [embedding, person.id]);
  await audit(req.user, 'FACE_ENROLL', { personId: person.id });
  res.json({ ok: true });
});

/** multipart: selfie (image/jpeg), data JSON { personId, lat, lng, accuracy, simulated } */
r.post('/attendance/checkin', ngo, upload.single('selfie'), async (req, res) => {
  let data;
  try { data = JSON.parse(req.body.data || '{}'); } catch { throw new HttpError(400, 'Invalid data JSON'); }
  if (!req.file) throw new HttpError(400, 'Live selfie required');
  const lat = Number(data.lat), lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new HttpError(400, 'GPS location required');

  const person = (await query(
    `SELECT pe.id, pe.name, pe.kind, pe.face_embedding, p.geofence_m, ST_Distance(p.location, ST_MakePoint($3,$2)::geography)::int AS distance_m
     FROM people pe JOIN projects p ON p.id = pe.project_id WHERE pe.id = $1 AND pe.project_id = $4`,
    [data.personId, lat, lng, req.user.projectId])).rows[0];
  if (!person) throw new HttpError(404, 'Person not found');
  if (!person.face_embedding) throw new HttpError(409, 'Face not enrolled for this person');

  const face = await ml.faceVerify(req.file.buffer, person.face_embedding);
  const withinFence = person.distance_m <= person.geofence_m;
  const accepted = withinFence && face.match;
  const reason = !face.faces ? 'No face detected' : face.faces > 1 ? 'Multiple faces in frame' : !face.match ? 'Face does not match enrolled person' : !withinFence ? 'Outside project geofence' : null;

  const out = await tx(async c => {
    const ev = await evidence.store(c, { ...req.file, mimetype: 'image/jpeg' }, { kind: 'selfie', projectId: req.user.projectId, lat, lng, userId: req.user.id });
    const { rows } = await c.query(
      `INSERT INTO checkins (project_id, person_id, location, distance_m, within_fence, face_score, face_match, accepted, evidence_id, simulated)
       VALUES ($1,$2, ST_MakePoint($4,$3)::geography, $5,$6,$7,$8,$9,$10,$11) RETURNING id, ts`,
      [req.user.projectId, person.id, lat, lng, person.distance_m, withinFence, face.score, face.match, accepted, ev.id, !!data.simulated]);
    if (accepted && person.kind === 'beneficiary') {
      // Biometric attendance overrides the paper register for the day.
      await c.query(
        `INSERT INTO attendance_daily (project_id, day, count, source)
         SELECT $1, CURRENT_DATE, COUNT(DISTINCT k.person_id), 'biometric' FROM checkins k JOIN people pe ON pe.id = k.person_id
         WHERE k.project_id = $1 AND k.accepted AND pe.kind = 'beneficiary' AND k.ts::date = CURRENT_DATE
         ON CONFLICT (project_id, day) DO UPDATE SET count = EXCLUDED.count, source = 'biometric'`, [req.user.projectId]);
    }
    return rows[0];
  });

  invalidate();
  await audit(req.user, 'ATTENDANCE', { checkinId: Number(out.id), personId: person.id, accepted, faceScore: face.score, distanceM: person.distance_m });
  if (!accepted) await notify.alert({ sev: 'med', code: 'ATTENDANCE_REJECTED', projectId: req.user.projectId, text: `${person.name}: ${reason}` });
  res.json({ accepted, reason, personId: person.id, personName: person.name, distanceM: person.distance_m, withinFence, faceScore: face.score, faceMatch: face.match });
});

module.exports = r;
