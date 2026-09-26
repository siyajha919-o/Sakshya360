// Beneficiary voice: signed-in feedback (mobile app, OTP) and anonymous feedback from the QR code
// displayed at every centre. Grievances raise alerts and feed the project risk score.
const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db/pg');
const { requireRole, requireMonitor, scopeClause, inScope } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { rateLimit } = require('../middleware/rateLimit');
const { invalidate } = require('../services/analytics');
const { audit } = require('../services/audit');
const notify = require('../services/notify');
const push = require('../services/push');
const signing = require('../services/signing');

const r = Router();
const CATEGORIES = ['fake_attendance', 'staff_absent', 'food', 'facilities', 'behaviour', 'money_demanded', 'other', 'praise'];
const SERIOUS = ['fake_attendance', 'money_demanded', 'behaviour'];
const STATUSES = ['open', 'in_review', 'resolved', 'rejected'];

function parse(body) {
  const b = body || {};
  if (!CATEGORIES.includes(b.category)) throw new HttpError(400, 'Choose a category');
  const rating = b.rating == null ? null : parseInt(b.rating, 10);
  if (rating != null && !(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Rating must be 1–5');
  const text = String(b.text || '').trim().slice(0, 2000);
  if (b.category !== 'praise' && text.length < 5 && !['fake_attendance', 'staff_absent'].includes(b.category)) throw new HttpError(400, 'Please describe the problem');
  const bool = v => (v === true || v === false ? v : null);
  return { category: b.category, rating, text, present: bool(b.present), servicesOk: bool(b.servicesOk), lang: b.lang === 'hi' ? 'hi' : 'en' };
}

async function create(projectId, personId, channel, f) {
  const id = 'G' + crypto.randomBytes(6).toString('hex');
  await query(
    `INSERT INTO feedback (id, project_id, person_id, channel, category, rating, present, services_ok, text, lang)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, projectId, personId, channel, f.category, f.rating, f.present, f.servicesOk, f.text, f.lang]);
  invalidate();
  await audit(personId ? { id: personId, role: 'beneficiary' } : { id: null, role: 'public' }, 'FEEDBACK', { feedbackId: id, projectId, channel, category: f.category });
  if (f.category !== 'praise') {
    await notify.alert({
      sev: SERIOUS.includes(f.category) ? 'high' : 'med', code: 'GRIEVANCE', projectId,
      text: `${channel === 'qr' ? 'Anonymous' : 'Beneficiary'} grievance: ${f.category.replace(/_/g, ' ')}${f.text ? ` – “${f.text.slice(0, 80)}”` : ''}`,
    });
  }
  notify.refresh('feedback');
  return id;
}

// ------------------------------------------------ beneficiary (signed in with OTP)
r.post('/feedback', requireRole('beneficiary'), async (req, res) => {
  const id = await create(req.user.projectId, req.user.id, 'app', parse(req.body));
  res.status(201).json({ id });
});

r.get('/feedback/mine', requireRole('beneficiary'), async (req, res) => {
  const { rows } = await query(
    `SELECT id, category, rating, text, created_at, status, response, responded_at FROM feedback WHERE person_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
  res.json(rows);
});

// ------------------------------------------------ public QR (anonymous, rate-limited)
const publicLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: req => `fb:${req.ip}:${req.params.projectId}` });

async function qrProject(projectId, token) {
  if (!signing.verify('feedback', projectId, 0, token)) throw new HttpError(403, 'Invalid or outdated QR code');
  const p = (await query('SELECT id, name, scheme, ngo, district, state FROM projects WHERE id = $1', [projectId])).rows[0];
  if (!p) throw new HttpError(404, 'Centre not found');
  return p;
}

r.get('/public/feedback/:projectId', async (req, res) => {
  res.json({ project: await qrProject(req.params.projectId, req.query.t), categories: CATEGORIES });
});

r.post('/public/feedback/:projectId', publicLimit, async (req, res) => {
  const p = await qrProject(req.params.projectId, req.query.t);
  const id = await create(p.id, null, 'qr', parse(req.body));
  res.status(201).json({ id, reference: id.slice(1, 7).toUpperCase() });
});

// ------------------------------------------------ officials
r.get('/feedback', requireMonitor, async (req, res) => {
  const params = [];
  let where = scopeClause(req.user, params).sql;
  if (req.query.status && STATUSES.includes(req.query.status)) { params.push(req.query.status); where += ` AND f.status = $${params.length}`; }
  if (req.query.projectId) { params.push(req.query.projectId); where += ` AND f.project_id = $${params.length}`; }
  const { rows } = await query(
    `SELECT f.*, p.name AS project_name, p.district, p.state, pe.name AS person_name, u.name AS responder_name
     FROM feedback f JOIN projects p ON p.id = f.project_id LEFT JOIN people pe ON pe.id = f.person_id LEFT JOIN users u ON u.id = f.responded_by
     WHERE ${where} ORDER BY (f.status IN ('open', 'in_review')) DESC, f.created_at DESC LIMIT 200`, params);
  res.json(rows);
});

r.post('/feedback/:id/respond', requireMonitor, async (req, res) => {
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'in_review';
  const response = String(req.body.response || '').trim().slice(0, 2000);
  const f = (await query('SELECT f.*, p.state, p.district FROM feedback f JOIN projects p ON p.id = f.project_id WHERE f.id = $1', [req.params.id])).rows[0];
  if (!f || !inScope(req.user, f)) throw new HttpError(404, 'Grievance not found');
  await query('UPDATE feedback SET status = $1, response = $2, responded_by = $3, responded_at = now() WHERE id = $4', [status, response || null, req.user.id, f.id]);
  invalidate();
  await audit(req.user, 'FEEDBACK_RESPOND', { feedbackId: f.id, status });
  if (f.person_id && response) {
    push.toSubjects([f.person_id], {
      title: { en: 'Reply to your feedback', hi: 'आपकी शिकायत का उत्तर' },
      body: response.slice(0, 150),
      data: { type: 'feedback', feedbackId: f.id },
    }).catch(() => {});
  }
  notify.refresh('feedback');
  res.json({ ok: true, status });
});

module.exports = r;
