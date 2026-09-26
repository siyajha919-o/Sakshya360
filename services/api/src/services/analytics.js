// Assembles live project signals from PostgreSQL and scores them with the ML service.
const { query } = require('../db/pg');
const ml = require('./ml');
const { scopeClause } = require('../middleware/auth');

const PROJECT_SQL = `
  SELECT p.id, p.name, p.scheme, p.ngo, p.district, p.state, p.sanctioned, p.geofence_m, p.fund_utilisation, p.complaints,
         ST_Y(p.location::geometry) AS lat, ST_X(p.location::geometry) AS lng,
         COALESCE(EXTRACT(DAY FROM now() - p.last_inspected)::int, 365) AS days_since_inspection,
         (SELECT json_agg(json_build_object('day', a.day, 'count', a.count) ORDER BY a.day) FROM attendance_daily a
            WHERE a.project_id = p.id AND a.day >= CURRENT_DATE - 30 AND a.day < CURRENT_DATE) AS attendance,
         (SELECT COALESCE(json_agg((CURRENT_DATE - v.day) - 1), '[]') FROM inspection_visits v WHERE v.project_id = p.id) AS visit_days_ago,
         (SELECT json_agg(json_build_object('id', c.id, 'label', c.label, 'online', c.online) ORDER BY c.id) FROM cameras c WHERE c.project_id = p.id) AS cameras,
         (SELECT COUNT(*)::int FROM reports r WHERE r.project_id = p.id AND NOT r.within_fence) AS geo_fails,
         (SELECT COUNT(*)::int FROM vc_sessions s WHERE s.project_id = p.id AND s.outcome IS NOT NULL AND s.outcome <> 'verified') AS vc_fails,
         (SELECT COUNT(*)::int FROM checkins k WHERE k.project_id = p.id AND NOT k.accepted AND k.ts > now() - interval '30 days') AS rejected_checkins,
         (SELECT row_to_json(x) FROM (SELECT headcount, register_count FROM reports r WHERE r.project_id = p.id ORDER BY submitted_at DESC LIMIT 1) x) AS last_report,
         (SELECT COUNT(*)::int FROM feedback f WHERE f.project_id = p.id AND f.category <> 'praise' AND f.status <> 'rejected' AND f.created_at > now() - interval '90 days') AS grievances,
         (SELECT COUNT(*)::int FROM feedback f WHERE f.project_id = p.id AND f.category <> 'praise' AND f.status IN ('open', 'in_review')) AS grievances_open,
         (SELECT COUNT(*)::int FROM feedback f WHERE f.project_id = p.id AND f.category = 'fake_attendance' AND f.status <> 'rejected' AND f.created_at > now() - interval '30 days') AS fake_attendance_reports,
         (SELECT COUNT(*)::int FROM cctv_observations o JOIN cameras c ON c.id = o.camera_id
            WHERE o.project_id = p.id AND o.suspicious AND c.source <> 'simulated' AND o.ts > now() - interval '7 days') AS cctv_low_occupancy
  FROM projects p`;

async function loadProjects(user, ids) {
  const params = [];
  let where = scopeClause(user, params).sql;
  if (ids) { params.push(ids); where += ` AND p.id = ANY($${params.length})`; }
  const { rows } = await query(`${PROJECT_SQL} WHERE ${where} ORDER BY p.id`, params);
  return rows.map(r => ({ ...r, attendance: r.attendance || [], cameras: r.cameras || [] }));
}

let cache = { at: 0, key: '', value: null };
const invalidate = () => { cache = { at: 0, key: '', value: null }; };

// Signals collected outside the ML feature set (beneficiary voice, automatic CCTV checks).
function extraFlags(p) {
  const out = [];
  if (p.fake_attendance_reports) out.push({ sev: 'high', code: 'BENEFICIARY_REPORT', text: `${p.fake_attendance_reports} beneficiary report(s) of fake attendance in 30 days` });
  if (p.grievances_open) out.push({ sev: 'med', code: 'OPEN_GRIEVANCES', text: `${p.grievances_open} grievance(s) awaiting action` });
  if (p.cctv_low_occupancy) out.push({ sev: 'high', code: 'CCTV_LOW_OCCUPANCY', text: `Automatic CCTV checks found far fewer people than the register ${p.cctv_low_occupancy} time(s) this week` });
  return out;
}

// The autoencoder flags a month that is smoother than any real centre (copy-paste register).
const aeFlags = an => (an && an.direction === 'too_regular' && an.sequence_score > 1
  ? [{ sev: 'med', code: 'AE_TOO_REGULAR', text: `Attendance pattern is more regular than any genuine centre (autoencoder score ${an.sequence_score})` }]
  : []);

async function scoreProjects(user, ids) {
  const projects = await loadProjects(user, ids);
  const key = `${user.role}:${user.state}:${user.district}:${ids || ''}`;
  if (cache.key === key && Date.now() - cache.at < 30000) return cache.value;

  const centres = projects.filter(p => p.attendance.length >= 7).map(p => ({
    id: p.id,
    attendance: p.attendance.map(a => a.count),
    sanctioned: p.sanctioned,
    inspection_days: p.visit_days_ago.filter(d => d >= 0 && d < p.attendance.length),
    complaints: p.complaints + p.grievances,
    fund_utilisation: p.fund_utilisation,
    last_inspected_days_ago: p.days_since_inspection,
    cameras_total: p.cameras.length,
    cameras_offline: p.cameras.filter(c => !c.online).length,
    geo_fails: p.geo_fails,
    vc_fails: p.vc_fails + p.rejected_checkins,
    headcount: p.last_report ? p.last_report.headcount : null,
    register_count: p.last_report ? p.last_report.register_count : null,
  }));

  let risk = [], anomaly = [], mlOnline = true;
  try {
    [risk, anomaly] = await Promise.all([
      ml.scoreRisk(centres),
      ml.attendanceAnomaly(centres.map(c => ({ id: c.id, values: c.attendance, sanctioned: c.sanctioned }))),
    ]);
  } catch (e) {
    mlOnline = false;
    console.warn(e.message);
  }
  const riskById = Object.fromEntries(risk.map(r => [r.id, r]));
  const anomById = Object.fromEntries(anomaly.map(a => [a.id, a]));

  const value = projects.map(p => {
    const counts = p.attendance.map(a => a.count);
    const avg = counts.length ? Math.round(counts.reduce((s, x) => s + x, 0) / counts.length) : 0;
    const r = riskById[p.id], an = anomById[p.id];
    return {
      ...p,
      analysis: {
        mlOnline,
        risk: r ? r.risk : null,
        band: r ? r.band : 'unknown',
        probability: r ? r.probability : null,
        novelty: r ? r.novelty : null,
        flags: [...(r ? r.flags : []), ...extraFlags(p), ...aeFlags(an)],
        drivers: r ? r.drivers : [],
        anomalousDays: an ? an.anomalous_days.map(i => p.attendance[i] && p.attendance[i].day) : [],
        sequenceScore: an ? an.sequence_score : null,
        sequenceDirection: an ? an.direction : null,
        avg,
        occupancy: p.sanctioned ? Math.round((avg / p.sanctioned) * 100) : 0,
      },
    };
  });
  cache = { at: Date.now(), key, value };
  return value;
}

module.exports = { loadProjects, scoreProjects, invalidate };
