const { Router } = require('express');
const QRCode = require('qrcode');
const { query } = require('../db/pg');
const { requireRole, requireMonitor, scopeLabel } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { scoreProjects } = require('../services/analytics');
const { verify } = require('../services/audit');
const signing = require('../services/signing');
const { publicWebUrl } = require('../config');
const ml = require('../services/ml');

const r = Router();

r.get('/dashboard', requireMonitor, async (req, res) => {
  const projects = await scoreProjects(req.user);
  const ids = projects.map(p => p.id);
  const cams = projects.flatMap(p => p.cameras);
  const [open, today, recent] = await Promise.all([
    query(`SELECT COUNT(*) FILTER (WHERE status <> 'completed')::int n, COUNT(*) FILTER (WHERE status = 'overdue')::int overdue
           FROM assignments WHERE project_id = ANY($1)`, [ids]),
    query(`SELECT COUNT(*)::int reports, COUNT(*) FILTER (WHERE NOT within_fence)::int geo_fails FROM reports WHERE submitted_at::date = CURRENT_DATE AND project_id = ANY($1)`, [ids]),
    query(`SELECT r.id, r.project_id, p.name project_name, u.name inspector, r.submitted_at, r.score, r.within_fence
           FROM reports r JOIN projects p ON p.id = r.project_id JOIN users u ON u.id = r.inspector_id
           WHERE r.project_id = ANY($1) ORDER BY r.submitted_at DESC LIMIT 5`, [ids]),
  ]);
  res.json({
    scope: scopeLabel(req.user),
    kpis: {
      projects: projects.length,
      camerasOnline: cams.filter(c => c.online).length,
      camerasTotal: cams.length,
      highRisk: projects.filter(p => p.analysis.band === 'high').length,
      highAlerts: projects.reduce((s, p) => s + p.analysis.flags.filter(f => f.sev === 'high').length, 0),
      openAssignments: open.rows[0].n,
      overdueAssignments: open.rows[0].overdue,
      reportsToday: today.rows[0].reports,
      geoFailsToday: today.rows[0].geo_fails,
      openGrievances: projects.reduce((s, p) => s + p.grievances_open, 0),
    },
    mlOnline: projects.length ? projects[0].analysis.mlOnline : false,
    projects,
    recentReports: recent.rows,
  });
});

r.get('/projects', requireMonitor, async (req, res) => res.json(await scoreProjects(req.user)));

r.get('/projects/:id', requireMonitor, async (req, res) => {
  const [p] = await scoreProjects(req.user, [req.params.id]);
  if (!p) throw new HttpError(404, 'Project not found');
  const [people, observations] = await Promise.all([
    query('SELECT id, name, kind, phone, face_enrolled_at IS NOT NULL AS face_enrolled FROM people WHERE project_id = $1 ORDER BY id', [p.id]),
    query(`SELECT o.ts, o.camera_id, o.persons, o.register_count, o.expected, o.suspicious, c.source
           FROM cctv_observations o JOIN cameras c ON c.id = o.camera_id WHERE o.project_id = $1 ORDER BY o.ts DESC LIMIT 20`, [p.id]),
  ]);
  res.json({ ...p, people: people.rows, cctvObservations: observations.rows });
});

// Printable QR poster for the centre: beneficiaries and visitors scan it to give anonymous feedback.
r.get('/projects/:id/feedback-qr', requireMonitor, async (req, res) => {
  const [p] = await scoreProjects(req.user, [req.params.id]);
  if (!p) throw new HttpError(404, 'Project not found');
  const url = `${publicWebUrl}/feedback/${p.id}?t=${signing.feedbackToken(p.id)}`;
  res.json({ url, svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) });
});

r.get('/analytics', requireMonitor, async (req, res) => {
  const [projects, model] = await Promise.all([scoreProjects(req.user), ml.metrics().catch(() => null)]);
  res.json({ projects, model });
});

// Labelled snapshots from real inspections, for retraining the risk model (services/ml/train.py --real).
// Label comes from what the inspector / VC actually found; those fields are withheld from the features.
r.get('/analytics/training-export', requireRole('official'), async (_req, res) => {
  const { rows } = await query(`
    SELECT r.id, r.project_id, r.submitted_at, r.score, r.headcount, r.register_count, p.sanctioned, p.fund_utilisation, p.complaints,
           (SELECT json_agg(a.count ORDER BY a.day) FROM attendance_daily a WHERE a.project_id = r.project_id
              AND a.day >= r.submitted_at::date - 30 AND a.day < r.submitted_at::date) AS attendance,
           (SELECT COALESCE(json_agg(r.submitted_at::date - v.day - 1), '[]') FROM inspection_visits v WHERE v.project_id = r.project_id
              AND v.day < r.submitted_at::date AND v.day >= r.submitted_at::date - 30) AS inspection_days,
           (SELECT COUNT(*)::int FROM vc_sessions s WHERE s.project_id = r.project_id AND s.outcome IN ('suspicious', 'unanswered')
              AND s.started_at BETWEEN r.submitted_at - interval '30 days' AND r.submitted_at + interval '7 days') AS vc_bad
    FROM reports r JOIN projects p ON p.id = r.project_id
    WHERE NOT r.simulated AND r.within_fence ORDER BY r.submitted_at`);
  const out = [];
  for (const x of rows) {
    if (!x.attendance || x.attendance.length < 7) continue;
    const gap = x.register_count ? 1 - x.headcount / x.register_count : 0;
    const bad = gap > 0.3 || x.score < 50 || x.vc_bad > 0;
    const good = gap <= 0.15 && x.score >= 75 && x.vc_bad === 0;
    if (!bad && !good) continue; // ambiguous outcome – leave unlabelled
    out.push({
      id: `${x.project_id}:${x.id}`, attendance: x.attendance, sanctioned: x.sanctioned, inspection_days: x.inspection_days,
      complaints: x.complaints, fund_utilisation: x.fund_utilisation, last_inspected_days_ago: 30,
      headcount: null, register_count: null, // label source – excluded to avoid leakage
      label: bad ? 'malpractice' : 'genuine',
    });
  }
  res.type('application/x-ndjson').set('Content-Disposition', 'attachment; filename="sakshya360-labelled.jsonl"').send(out.map(o => JSON.stringify(o)).join('\n') + (out.length ? '\n' : ''));
});

r.get('/audit', requireRole('official'), async (req, res) => {
  const { rows } = await query('SELECT id, ts, actor, role, action, detail, hash FROM audit_log ORDER BY id DESC LIMIT 100');
  res.json(rows);
});
r.get('/audit/verify', requireRole('official'), async (req, res) => res.json(await verify()));

module.exports = r;
