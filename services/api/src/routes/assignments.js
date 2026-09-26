const { Router } = require('express');
const { query } = require('../db/pg');
const { requireRole, scopeClause, MONITOR_ROLES } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { audit } = require('../services/audit');
const assignment = require('../services/assignment');
const settings = require('../services/settings');
const jobs = require('../services/jobs');

const r = Router();

const ASSIGNMENT_SQL = `
  SELECT a.id, a.status, a.created_at, a.due_at, a.batch_id, a.solver,
         a.inspector_id, u.name AS inspector_name, u.team,
         p.id AS project_id, p.name AS project_name, p.scheme, p.ngo, p.district, p.state, p.geofence_m,
         ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
         ROUND(ST_Distance(u.base_location, p.location) / 1000)::int AS distance_km,
         (SELECT count FROM attendance_daily d WHERE d.project_id = p.id ORDER BY day DESC LIMIT 1) AS register_count
  FROM assignments a JOIN users u ON u.id = a.inspector_id JOIN projects p ON p.id = a.project_id`;

r.get('/assignments', requireRole(...MONITOR_ROLES, 'inspector'), async (req, res) => {
  const params = [];
  let where;
  if (req.user.role === 'inspector') { params.push(req.user.id); where = 'a.inspector_id = $1'; } else where = scopeClause(req.user, params).sql;
  const { rows } = await query(`${ASSIGNMENT_SQL} WHERE ${where} ORDER BY a.created_at DESC LIMIT 200`, params);
  res.json(rows);
});

// Random, risk-weighted, conflict-free assignment solved with OR-Tools CP-SAT in the ML service.
r.post('/assignments/optimize', requireRole('official'), async (req, res) => {
  res.json(await assignment.createBatch(req.user, { count: req.body.count, dueInDays: req.body.dueInDays, trigger: 'manual' }));
});

r.post('/assignments/:id/start', requireRole('inspector'), async (req, res) => {
  const { rowCount } = await query(`UPDATE assignments SET status = 'in_progress' WHERE id = $1 AND inspector_id = $2 AND status IN ('assigned', 'overdue')`, [req.params.id, req.user.id]);
  if (!rowCount) throw new HttpError(404, 'Assignment not found or already started');
  await audit(req.user, 'INSPECTION_START', { assignmentId: req.params.id });
  res.json({ ok: true });
});

// Automation: daily random assignment schedule + automatic CCTV checks.
r.get('/automation', requireRole(...MONITOR_ROLES), async (_req, res) => {
  res.json({ settings: await settings.get('automation'), jobs: await jobs.status() });
});

r.put('/automation', requireRole('official'), async (req, res) => {
  const a = req.body.autoAssign || {}, c = req.body.cctvWatch || {};
  const int = (v, lo, hi) => (v === undefined ? undefined : Math.max(lo, Math.min(hi, parseInt(v, 10) || lo)));
  const next = await settings.set('automation', {
    autoAssign: {
      ...(a.enabled !== undefined && { enabled: !!a.enabled }),
      ...(a.weekdaysOnly !== undefined && { weekdaysOnly: !!a.weekdaysOnly }),
      ...(a.hour !== undefined && { hour: int(a.hour, 0, 23) }),
      ...(a.minute !== undefined && { minute: int(a.minute, 0, 59) }),
      ...(a.count !== undefined && { count: int(a.count, 1, 20) }),
      ...(a.dueInDays !== undefined && { dueInDays: int(a.dueInDays, 1, 30) }),
    },
    cctvWatch: {
      ...(c.enabled !== undefined && { enabled: !!c.enabled }),
      ...(c.fromHour !== undefined && { fromHour: int(c.fromHour, 0, 23) }),
      ...(c.toHour !== undefined && { toHour: int(c.toHour, 1, 24) }),
    },
  });
  await audit(req.user, 'AUTOMATION_UPDATE', next);
  res.json({ settings: next, jobs: await jobs.status() });
});

// Run a job now (e.g. to demo the camera-health check without waiting for the interval).
r.post('/automation/run/:job', requireRole('official'), async (req, res) => {
  if (!['overdue', 'cameraHealth', 'cctvWatch'].includes(req.params.job)) throw new HttpError(400, 'Unknown job');
  await jobs.run(req.params.job);
  res.json(await jobs.status());
});

module.exports = r;
