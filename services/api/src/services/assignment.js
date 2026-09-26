// Random, risk-weighted, conflict-free inspection assignment. Used by the "Generate" button and by the
// daily automatic scheduler, so both paths produce identical, audit-logged batches.
const crypto = require('crypto');
const { query, tx } = require('../db/pg');
const { HttpError } = require('../middleware/errors');
const { scoreProjects, invalidate } = require('./analytics');
const { audit } = require('./audit');
const ml = require('./ml');
const notify = require('./notify');

// The scheduler acts as this system principal (full scope, audited as role 'system').
const SYSTEM = { id: 'SYSTEM', role: 'official', name: 'Automatic scheduler' };

async function createBatch(actor, { count = 3, dueInDays = 5, trigger = 'manual' } = {}) {
  count = Math.max(1, Math.min(20, parseInt(count, 10) || 3));
  dueInDays = Math.max(1, Math.min(30, parseInt(dueInDays, 10) || 5));
  const seed = crypto.randomInt(0, 2 ** 31);

  const projects = await scoreProjects(actor);
  const busy = new Set((await query(`SELECT project_id FROM assignments WHERE status <> 'completed'`)).rows.map(x => x.project_id));
  const candidates = projects.filter(p => !busy.has(p.id));
  if (!candidates.length) throw new HttpError(409, 'Every project already has an open inspection');

  const inspectors = (await query(`
    SELECT u.id, u.name, u.state AS home_state, u.capacity,
           (SELECT COUNT(*)::int FROM assignments a WHERE a.inspector_id = u.id AND a.status <> 'completed') AS open_load,
           (SELECT COALESCE(json_agg(DISTINCT r.project_id), '[]') FROM reports r WHERE r.inspector_id = u.id) AS visited
    FROM users u WHERE u.role = 'inspector' ORDER BY u.id`)).rows;
  const dist = (await query(`
    SELECT u.id AS inspector_id, p.id AS project_id, ROUND(ST_Distance(u.base_location, p.location) / 1000)::int AS km
    FROM users u CROSS JOIN projects p WHERE u.role = 'inspector' AND p.id = ANY($1)`, [candidates.map(p => p.id)])).rows;

  const result = await ml.optimiseAssignment({
    seed, count,
    projects: candidates.map(p => ({ id: p.id, state: p.state, risk: p.analysis.risk == null ? 50 : p.analysis.risk, days_since_inspection: p.days_since_inspection })),
    inspectors: inspectors.map(i => ({ id: i.id, home_state: i.home_state, capacity: Math.max(0, i.capacity - i.open_load), visited: i.visited })),
    distance_km: dist.map(d => ({ inspector_id: d.inspector_id, project_id: d.project_id, km: d.km })),
  });

  const batchId = 'B' + Date.now().toString(36);
  const created = await tx(async c => {
    const out = [];
    for (const a of result.assignments) {
      const id = 'A' + crypto.randomBytes(6).toString('hex');
      const due = 1 + crypto.randomInt(0, dueInDays);
      await c.query(`INSERT INTO assignments (id, project_id, inspector_id, due_at, batch_id, seed, solver)
                     VALUES ($1,$2,$3, now() + make_interval(days => $4), $5, $6, $7)`,
        [id, a.project_id, a.inspector_id, due, batchId, seed, { km: a.km, priority: a.priority, reason: a.reason, trigger }]);
      out.push({ id, ...a });
    }
    return out;
  });
  invalidate();
  await audit(actor === SYSTEM ? { id: 'SYSTEM', role: 'system' } : actor, 'ASSIGN_BATCH',
    { batchId, seed, trigger, count: created.length, status: result.status, pairs: result.assignments.map(a => `${a.project_id}->${a.inspector_id}`) });

  for (const a of created) {
    notify.toInspector(a.inspector_id, 'assignment:new', { projectId: a.project_id, assignmentId: a.id }, {
      title: { en: 'New surprise inspection', hi: 'नया औचक निरीक्षण' },
      body: { en: 'A new inspection duty has been assigned to you. Open Sakshya360 for details.', hi: 'आपको नया निरीक्षण कार्य सौंपा गया है। विवरण के लिए Sakshya360 खोलें।' },
      data: { type: 'assignment', assignmentId: a.id },
      channelId: 'duties',
    });
  }
  notify.refresh('assignment');
  return { batchId, seed, created: created.length, trigger, solver: result };
}

// Marks open assignments past their due date as overdue and alerts the Division and the inspector.
async function markOverdue() {
  const { rows } = await query(
    `UPDATE assignments a SET status = 'overdue' FROM users u, projects p
     WHERE a.inspector_id = u.id AND a.project_id = p.id AND a.status IN ('assigned', 'in_progress') AND a.due_at < now()
     RETURNING a.id, a.project_id, a.inspector_id, u.name AS inspector_name, p.name AS project_name`);
  for (const a of rows) {
    await audit({ id: 'SYSTEM', role: 'system' }, 'ASSIGNMENT_OVERDUE', { assignmentId: a.id, projectId: a.project_id, inspectorId: a.inspector_id });
    await notify.alert({ sev: 'med', code: 'INSPECTION_OVERDUE', projectId: a.project_id, text: `${a.inspector_name} has not inspected ${a.project_name} by the due date` });
    notify.toInspector(a.inspector_id, 'assignment:overdue', { assignmentId: a.id }, {
      title: { en: 'Inspection overdue', hi: 'निरीक्षण की समय-सीमा समाप्त' },
      body: { en: `${a.project_name} is past its due date. Complete it today.`, hi: `${a.project_name} की समय-सीमा निकल चुकी है। आज ही पूरा करें।` },
      data: { type: 'assignment', assignmentId: a.id },
      channelId: 'duties',
    });
  }
  if (rows.length) { invalidate(); notify.refresh('overdue'); }
  return rows.length;
}

module.exports = { SYSTEM, createBatch, markOverdue };
