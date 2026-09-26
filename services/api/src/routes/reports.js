const { Router } = require('express');
const crypto = require('crypto');
const multer = require('multer');
const { query, tx } = require('../db/pg');
const { maxUploadBytes } = require('../config');
const { requireRole, scopeClause, inScope, MONITOR_ROLES } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const evidence = require('../services/evidence');
const mongo = require('../db/mongo');
const { invalidate } = require('../services/analytics');
const { audit, sha256 } = require('../services/audit');
const notify = require('../services/notify');
const signing = require('../services/signing');
const { reportPdf } = require('../services/pdf');

// Reports can be queued on the phone while offline; more than this gap between capture and upload is flagged.
const DELAYED_SYNC_S = 15 * 60;

const r = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxUploadBytes, files: 8 } });

const REPORT_SQL = `
  SELECT r.id, r.assignment_id, r.project_id, p.name AS project_name, p.district, p.state,
         r.inspector_id, u.name AS inspector_name, r.submitted_at,
         ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
         ST_Y(p.location::geometry) AS site_lat, ST_X(p.location::geometry) AS site_lng,
         r.captured_at, r.delayed_sync, r.accuracy_m, r.distance_m, r.within_fence, r.simulated, r.checklist, r.score, r.headcount, r.register_count, r.remarks, r.signature,
         (SELECT COALESCE(json_agg(json_build_object('id', e.id, 'sha256', e.sha256, 'kind', e.kind, 'mime', e.mime) ORDER BY e.captured_at), '[]')
            FROM evidence e WHERE e.report_id = r.id) AS evidence
  FROM reports r JOIN projects p ON p.id = r.project_id JOIN users u ON u.id = r.inspector_id`;

// Evidence and PDF links are signed and short-lived, so no session token ever appears in a URL.
const withLinks = row => ({
  ...row,
  pdfUrl: signing.reportPdfUrl(row.id),
  evidence: row.evidence.map(e => ({ ...e, url: signing.evidenceUrl(e.id) })),
});

r.get('/reports', requireRole(...MONITOR_ROLES, 'inspector'), async (req, res) => {
  const params = [];
  let where;
  if (req.user.role === 'inspector') { params.push(req.user.id); where = 'r.inspector_id = $1'; } else where = scopeClause(req.user, params).sql;
  const { rows } = await query(`${REPORT_SQL} WHERE ${where} ORDER BY r.submitted_at DESC LIMIT 100`, params);
  res.json(rows.map(withLinks));
});

// PDF export. Authorised by a signed link (from the list above) or a bearer token.
r.get('/reports/:id/pdf', async (req, res, next) => {
  if (!signing.verify('report-pdf', req.params.id, req.query.exp, req.query.sig)) {
    return requireRole(...MONITOR_ROLES, 'inspector')(req, res, async err => {
      if (err) return next(err);
      try { await sendPdf(req, res, req.user); } catch (e) { next(e); }
    });
  }
  await sendPdf(req, res, null);
});

async function sendPdf(req, res, user) {
  const row = (await query(`${REPORT_SQL} WHERE r.id = $1`, [req.params.id])).rows[0];
  if (!row) throw new HttpError(404, 'Report not found');
  if (user && !(user.role === 'inspector' ? row.inspector_id === user.id : inScope(user, row))) throw new HttpError(403, 'Not permitted');
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="sakshya360-${row.id}.pdf"`, 'Cache-Control': 'private, no-store' });
  await reportPdf(row, res);
}

/**
 * multipart/form-data
 *   data     JSON { assignmentId, lat, lng, accuracy, simulated, capturedAt, checklist: [{item, ok}], headcount, registerCount, remarks }
 *   photos[] image/jpeg (1..6, camera-captured, GPS/time watermark burned in on device)
 *   video    video/mp4 (optional short walkthrough)
 */
r.post('/reports', requireRole('inspector'), upload.fields([{ name: 'photos', maxCount: 6 }, { name: 'video', maxCount: 1 }]), async (req, res) => {
  let data;
  try { data = JSON.parse(req.body.data || '{}'); } catch { throw new HttpError(400, 'Invalid data JSON'); }
  const photos = (req.files && req.files.photos) || [];
  const video = req.files && req.files.video ? req.files.video[0] : null;
  const lat = Number(data.lat), lng = Number(data.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'Valid GPS location required');
  if (!photos.length) throw new HttpError(400, 'At least one live photo is required');
  if (!Number.isInteger(data.headcount) || data.headcount < 0) throw new HttpError(400, 'Physical headcount required');
  // Capture time claimed by the device (offline queue). Must be in the past and within 7 days.
  let capturedAt = data.capturedAt ? new Date(data.capturedAt) : null;
  if (capturedAt && (Number.isNaN(capturedAt.getTime()) || capturedAt > new Date(Date.now() + 5 * 60000) || capturedAt < new Date(Date.now() - 7 * 86400000))) {
    throw new HttpError(400, 'Invalid capture time');
  }
  const delayedSync = !!capturedAt && (Date.now() - capturedAt.getTime()) / 1000 > DELAYED_SYNC_S;
  const checklist = Array.isArray(data.checklist) ? data.checklist.map(c => ({ item: String(c.item).slice(0, 200), ok: !!c.ok })) : [];
  if (!checklist.length) throw new HttpError(400, 'Checklist required');

  const stored = []; // GridFS ids to clean up if the transaction fails
  const report = await tx(async c => {
    const a = (await c.query(
      `SELECT a.*, ST_Distance(p.location, ST_MakePoint($3,$2)::geography)::int AS distance_m, p.geofence_m,
              (SELECT count FROM attendance_daily d WHERE d.project_id = p.id ORDER BY day DESC LIMIT 1) AS latest_register
       FROM assignments a JOIN projects p ON p.id = a.project_id WHERE a.id = $1 FOR UPDATE OF a`,
      [data.assignmentId, lat, lng])).rows[0];
    if (!a || a.inspector_id !== req.user.id) throw new HttpError(404, 'Assignment not found');
    if (a.status === 'completed') throw new HttpError(409, 'Report already submitted for this assignment');

    const id = 'R' + crypto.randomBytes(6).toString('hex');
    const withinFence = a.distance_m <= a.geofence_m;
    const score = Math.round((checklist.filter(x => x.ok).length / checklist.length) * 100);
    const registerCount = Number.isInteger(data.registerCount) ? data.registerCount : a.latest_register || 0;

    // Evidence rows reference the report, so insert a provisional report first, then sign once hashes are known.
    await c.query(
      `INSERT INTO reports (id, assignment_id, project_id, inspector_id, location, accuracy_m, distance_m, within_fence, simulated,
                            checklist, score, headcount, register_count, remarks, signature, captured_at, delayed_sync)
       VALUES ($1,$2,$3,$4, ST_MakePoint($6,$5)::geography, $7,$8,$9,$10,$11,$12,$13,$14,$15,'pending',$16,$17)`,
      [id, a.id, a.project_id, req.user.id, lat, lng, Number(data.accuracy) || null, a.distance_m, withinFence, !!data.simulated,
        JSON.stringify(checklist), score, data.headcount, registerCount, String(data.remarks || '').slice(0, 4000), capturedAt, delayedSync]);

    for (const f of photos) stored.push(await evidence.store(c, f, { kind: 'photo', projectId: a.project_id, reportId: id, lat, lng, userId: req.user.id }));
    if (video) stored.push(await evidence.store(c, video, { kind: 'video', projectId: a.project_id, reportId: id, lat, lng, userId: req.user.id }));

    const signature = sha256(JSON.stringify([id, a.id, req.user.id, lat, lng, capturedAt && capturedAt.toISOString(), checklist, data.headcount, registerCount, stored.map(s => s.sha256)]));
    await c.query('UPDATE reports SET signature = $1 WHERE id = $2', [signature, id]);
    await c.query(`UPDATE assignments SET status = 'completed' WHERE id = $1`, [a.id]);
    await c.query('UPDATE projects SET last_inspected = now() WHERE id = $1', [a.project_id]);
    await c.query('INSERT INTO inspection_visits VALUES ($1, CURRENT_DATE) ON CONFLICT DO NOTHING', [a.project_id]);
    return { id, projectId: a.project_id, delayedSync, withinFence, distanceM: a.distance_m, score, signature, evidence: stored, headcount: data.headcount, registerCount };
  }).catch(async e => {
    await Promise.all(stored.map(s => mongo.deleteFile(s.id).catch(() => {})));
    throw e;
  });

  invalidate();
  await audit(req.user, 'REPORT_SUBMIT', { reportId: report.id, projectId: report.projectId, withinFence: report.withinFence, score: report.score, delayedSync: report.delayedSync, signature: report.signature });

  await notify.toMonitors(report.projectId, 'report:new', { reportId: report.id, projectId: report.projectId, inspector: req.user.name, withinFence: report.withinFence, score: report.score });
  if (!report.withinFence) await notify.alert({ sev: 'high', code: 'GEOFENCE_FAIL', projectId: report.projectId, text: `${req.user.name} filed a report ${report.distanceM} m from the site` });
  if (report.registerCount && report.headcount < report.registerCount * 0.7) {
    await notify.alert({ sev: 'high', code: 'HEADCOUNT_MISMATCH', projectId: report.projectId, text: `Headcount ${report.headcount} vs register ${report.registerCount}` });
  }
  if (report.delayedSync) await notify.alert({ sev: 'info', code: 'OFFLINE_SYNC', projectId: report.projectId, text: `${req.user.name}'s report was captured offline and synced later` });
  notify.refresh('report');
  res.status(201).json({ ...report, pdfUrl: signing.reportPdfUrl(report.id) });
});

module.exports = r;
