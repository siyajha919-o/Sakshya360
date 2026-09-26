const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db/pg');
const mongo = require('../db/mongo');
const { requireRole, inScope, MONITOR_ROLES } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const signing = require('../services/signing');

const r = Router();

async function load(id) {
  const { rows } = await query(
    `SELECT e.*, p.state, p.district, r.inspector_id FROM evidence e LEFT JOIN projects p ON p.id = e.project_id LEFT JOIN reports r ON r.id = e.report_id WHERE e.id = $1`,
    [id]);
  if (!rows[0]) throw new HttpError(404, 'Evidence not found');
  return rows[0];
}

function authorise(u, e) {
  const allowed = (MONITOR_ROLES.includes(u.role) && inScope(u, e))
    || (u.role === 'inspector' && e.inspector_id === u.id)
    || (u.role === 'ngo' && e.project_id === u.projectId && e.kind === 'selfie');
  if (!allowed) throw new HttpError(403, 'Not permitted');
}

function stream(res, e) {
  res.set({ 'Content-Type': e.mime, 'Cache-Control': 'private, max-age=3600', 'X-Evidence-SHA256': e.sha256 });
  mongo.openDownload(e.id).on('error', () => res.destroy()).pipe(res);
}

// Streams the file. <img>/<video> tags use the signed ?exp=&sig= link handed out with each report;
// API clients can instead send a bearer token.
r.get('/evidence/:id', async (req, res, next) => {
  if (signing.verify('evidence', req.params.id, req.query.exp, req.query.sig)) return stream(res, await load(req.params.id));
  requireRole()(req, res, async err => {
    if (err) return next(err);
    try {
      const e = await load(req.params.id);
      authorise(req.user, e);
      stream(res, e);
    } catch (e) { next(e); }
  });
});

// Fresh signed link for one file (links in lists expire after an hour).
r.get('/evidence/:id/url', requireRole(), async (req, res) => {
  const e = await load(req.params.id);
  authorise(req.user, e);
  res.json({ url: signing.evidenceUrl(e.id) });
});

// Re-hashes the stored bytes to prove the evidence has not been altered since upload.
r.get('/evidence/:id/verify', requireRole(...MONITOR_ROLES), async (req, res) => {
  const e = await load(req.params.id);
  authorise(req.user, e);
  const h = crypto.createHash('sha256');
  await new Promise((resolve, reject) => mongo.openDownload(e.id).on('data', d => h.update(d)).on('end', resolve).on('error', reject));
  const actual = h.digest('hex');
  res.json({ id: e.id, expected: e.sha256, actual, intact: actual === e.sha256 });
});

module.exports = r;
