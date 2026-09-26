// Random video verification over Jitsi Meet. The server picks the person; rooms are unguessable.
const { Router } = require('express');
const crypto = require('crypto');
const { query } = require('../db/pg');
const { jitsiDomain } = require('../config');
const { requireRole, scopeClause, inScope, MONITOR_ROLES } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { invalidate } = require('../services/analytics');
const { audit } = require('../services/audit');
const notify = require('../services/notify');

const r = Router();
const ANSWER_WINDOW_S = 60;
const OUTCOMES = ['verified', 'partial', 'suspicious', 'unanswered'];

const SESSION_SQL = `
  SELECT s.id, s.room, s.started_at, s.answered_at, s.ended_at, s.outcome, s.checks,
         p.id AS project_id, p.name AS project_name, p.district, p.state,
         pe.id AS person_id, pe.name AS person_name, pe.kind AS person_kind, u.name AS caller_name
  FROM vc_sessions s JOIN projects p ON p.id = s.project_id JOIN people pe ON pe.id = s.person_id JOIN users u ON u.id = s.caller_id`;
const withJoin = row => row && { ...row, jitsiDomain, answerWindowS: ANSWER_WINDOW_S };

r.post('/vc/random', requireRole(...MONITOR_ROLES), async (req, res) => {
  const params = [];
  let where = scopeClause(req.user, params).sql;
  if (req.body.projectId) { params.push(req.body.projectId); where += ` AND p.id = $${params.length}`; }
  const projects = (await query(`SELECT p.id FROM projects p WHERE ${where}`, params)).rows;
  if (!projects.length) throw new HttpError(404, 'No project in scope');
  const project = projects[crypto.randomInt(0, projects.length)];
  const people = (await query('SELECT id FROM people WHERE project_id = $1', [project.id])).rows;
  const person = people[crypto.randomInt(0, people.length)];

  const id = 'V' + crypto.randomBytes(6).toString('hex');
  const room = `sakshya360-${crypto.randomBytes(12).toString('hex')}`;
  await query('INSERT INTO vc_sessions (id, project_id, person_id, room, caller_id) VALUES ($1,$2,$3,$4,$5)', [id, project.id, person.id, room, req.user.id]);
  const session = withJoin((await query(`${SESSION_SQL} WHERE s.id = $1`, [id])).rows[0]);
  await audit(req.user, 'VC_START', { sessionId: id, projectId: project.id, personId: person.id });

  // Ring the project's devices: socket if the app is open, high-priority push if it is not.
  notify.toProject(project.id, 'vc:incoming', session, {
    title: { en: '📞 DoSJE verification call', hi: '📞 DoSJE सत्यापन कॉल' },
    body: { en: `${session.caller_name} is calling. Answer within ${ANSWER_WINDOW_S} seconds and show ${session.person_name}.`,
      hi: `${session.caller_name} कॉल कर रहे हैं। ${ANSWER_WINDOW_S} सेकंड में उत्तर दें और ${session.person_name} को दिखाएँ।` },
    data: { type: 'vc', sessionId: id },
    channelId: 'calls',
    ttl: ANSWER_WINDOW_S * 2,
  });
  res.status(201).json(session);
});

r.post('/vc/:id/answer', requireRole('ngo'), async (req, res) => {
  const { rows } = await query(
    `UPDATE vc_sessions SET answered_at = now() WHERE id = $1 AND project_id = $2 AND answered_at IS NULL AND ended_at IS NULL RETURNING started_at, answered_at`,
    [req.params.id, req.user.projectId]);
  if (!rows[0]) throw new HttpError(404, 'Call not found or already answered');
  const seconds = Math.round((rows[0].answered_at - rows[0].started_at) / 1000);
  await audit(req.user, 'VC_ANSWER', { sessionId: req.params.id, seconds });
  await notify.toMonitors(req.user.projectId, 'vc:answered', { id: req.params.id, seconds });
  res.json({ ok: true, seconds, late: seconds > ANSWER_WINDOW_S });
});

r.post('/vc/:id/close', requireRole(...MONITOR_ROLES), async (req, res) => {
  const checks = req.body.checks && typeof req.body.checks === 'object' ? req.body.checks : {};
  let outcome = OUTCOMES.includes(req.body.outcome) ? req.body.outcome : null;
  const s = (await query('SELECT * FROM vc_sessions WHERE id = $1', [req.params.id])).rows[0];
  if (!s || !inScope(req.user, await notify.project(s.project_id))) throw new HttpError(404, 'Call not found');
  if (s.ended_at) throw new HttpError(409, 'Call already closed');
  if (!s.answered_at) outcome = 'unanswered';
  else if (!outcome) outcome = Object.values(checks).filter(Boolean).length >= 3 ? 'verified' : 'partial';
  await query('UPDATE vc_sessions SET ended_at = now(), outcome = $1, checks = $2 WHERE id = $3', [outcome, checks, s.id]);
  invalidate();
  await audit(req.user, 'VC_RESULT', { sessionId: s.id, projectId: s.project_id, outcome });
  if (outcome !== 'verified') await notify.alert({ sev: 'med', code: 'VC_FAILED', projectId: s.project_id, text: `Random VC ${outcome}` });
  notify.toProject(s.project_id, 'vc:ended', { id: s.id });
  res.json({ outcome });
});

r.get('/vc', requireRole(...MONITOR_ROLES, 'ngo'), async (req, res) => {
  const params = [];
  let where;
  if (req.user.role === 'ngo') { params.push(req.user.projectId); where = 'p.id = $1'; } else where = scopeClause(req.user, params).sql;
  const { rows } = await query(`${SESSION_SQL} WHERE ${where} ORDER BY s.started_at DESC LIMIT 100`, params);
  res.json(rows.map(withJoin));
});

// Pending (ringing) call for a project – lets the mobile app pick up a call it missed over the socket.
r.get('/vc/pending', requireRole('ngo'), async (req, res) => {
  const { rows } = await query(`${SESSION_SQL} WHERE p.id = $1 AND s.ended_at IS NULL AND s.started_at > now() - interval '10 minutes' ORDER BY s.started_at DESC LIMIT 1`, [req.user.projectId]);
  res.json(withJoin(rows[0]) || null);
});

module.exports = r;
