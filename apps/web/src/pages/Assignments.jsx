import { useState } from 'react';
import { api, getSession } from '../api';
import { fmt, Status, useApi } from '../components/ui';

const STATUS_TONE = { completed: 'green', overdue: 'red', in_progress: 'amber', assigned: 'amber' };
const pad = (n) => String(n).padStart(2, '0');

// Automatic daily random assignment + automatic CCTV checks, editable by the Division.
function Automation({ isOfficial, onRun }) {
  const auto = useApi(() => api('/automation'));
  const [draft, setDraft] = useState(null);
  const [msg, setMsg] = useState('');
  if (!auto.data) return <Status loading={auto.loading} error={auto.error} />;
  const cfg = draft || auto.data.settings;
  const a = cfg.autoAssign, c = cfg.cctvWatch;
  const runs = auto.data.jobs.runs || {};
  const set = (k, patch) => setDraft({ ...cfg, [k]: { ...cfg[k], ...patch } });
  const save = async () => {
    try { await api('/automation', { method: 'PUT', body: cfg }); setDraft(null); setMsg('Saved'); auto.reload(); } catch (e) { setMsg(e.message); }
  };
  const run = async (job) => {
    setMsg(`Running ${job}…`);
    try { await api(`/automation/run/${job}`, { method: 'POST' }); setMsg(`${job} finished`); auto.reload(); onRun(); } catch (e) { setMsg(e.message); }
  };
  const last = (name) => (runs[name] ? `${fmt(runs[name].lastRun)} · ${JSON.stringify(runs[name].detail)}` : 'not yet run');

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row between"><h2 style={{ margin: 0 }}>Automation</h2>{msg && <span className="muted">{msg}</span>}</div>
      <div className="grid g2" style={{ marginTop: 10 }}>
        <div className="stack">
          <label className="chk"><input type="checkbox" disabled={!isOfficial} checked={a.enabled} onChange={(e) => set('autoAssign', { enabled: e.target.checked })} /> <b>Daily random assignment</b></label>
          <div className="row">
            <span className="muted">At</span>
            <input type="time" disabled={!isOfficial} value={`${pad(a.hour)}:${pad(a.minute)}`} onChange={(e) => { const [h, m] = e.target.value.split(':'); set('autoAssign', { hour: +h, minute: +m }); }} />
            <span className="muted">IST ·</span>
            <input type="number" min="1" max="20" disabled={!isOfficial} value={a.count} onChange={(e) => set('autoAssign', { count: +e.target.value })} style={{ width: 60 }} />
            <span className="muted">inspections · due within</span>
            <input type="number" min="1" max="30" disabled={!isOfficial} value={a.dueInDays} onChange={(e) => set('autoAssign', { dueInDays: +e.target.value })} style={{ width: 60 }} />
            <span className="muted">days</span>
          </div>
          <label className="chk"><input type="checkbox" disabled={!isOfficial} checked={a.weekdaysOnly} onChange={(e) => set('autoAssign', { weekdaysOnly: e.target.checked })} /> Weekdays only</label>
          <div className="muted">Last run: {last('autoAssign')}</div>
          <div className="muted">Overdue check (every 5 min): {last('overdue')}</div>
        </div>
        <div className="stack">
          <label className="chk"><input type="checkbox" disabled={!isOfficial} checked={c.enabled} onChange={(e) => set('cctvWatch', { enabled: e.target.checked })} /> <b>Automatic CCTV occupancy checks</b></label>
          <div className="row">
            <span className="muted">Between</span>
            <input type="number" min="0" max="23" disabled={!isOfficial} value={c.fromHour} onChange={(e) => set('cctvWatch', { fromHour: +e.target.value })} style={{ width: 60 }} />
            <span className="muted">and</span>
            <input type="number" min="1" max="24" disabled={!isOfficial} value={c.toHour} onChange={(e) => set('cctvWatch', { toHour: +e.target.value })} style={{ width: 60 }} />
            <span className="muted">h IST</span>
          </div>
          <div className="muted">Last CCTV check: {last('cctvWatch')}</div>
          <div className="muted">Camera health: {last('cameraHealth')}</div>
        </div>
      </div>
      {isOfficial && (
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" disabled={!draft} onClick={save}>Save schedule</button>
          <button className="btn ghost sm" onClick={() => run('overdue')}>Check overdue now</button>
          <button className="btn ghost sm" onClick={() => run('cameraHealth')}>Check cameras now</button>
          <button className="btn ghost sm" onClick={() => run('cctvWatch')}>Run CCTV check now</button>
        </div>
      )}
    </div>
  );
}

export default function Assignments() {
  const isOfficial = getSession().user.role === 'official';
  const list = useApi(() => api('/assignments'));
  const [count, setCount] = useState(3);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError('');
    try {
      setResult(await api('/assignments/optimize', { body: { count } }));
      list.reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topline">
        <div><h1>Random inspection assignment</h1><div className="muted">OR-Tools CP-SAT: risk-weighted random priorities with conflict-of-interest, rotation and capacity constraints</div></div>
        {isOfficial && (
          <div className="row">
            <label className="muted">Inspections</label>
            <input type="number" min="1" max="20" value={count} onChange={(e) => setCount(+e.target.value)} style={{ width: 70 }} />
            <button className="btn saffron" onClick={run} disabled={busy}>{busy ? 'Solving…' : '🎲 Generate surprise inspections'}</button>
          </div>
        )}
      </div>
      {error && <div className="card error" style={{ marginBottom: 12 }}>{error}</div>}
      <Automation isOfficial={isOfficial} onRun={list.reload} />

      {result && (
        <div className="grid g2" style={{ marginBottom: 14 }}>
          <div className="card">
            <h2>Solver result · {result.solver.status} · {result.created}/{result.solver.requested} assigned</h2>
            <div className="muted">Batch {result.batchId} · seed <span className="mono">{result.seed}</span> (replayable, audit-logged)</div>
            <table style={{ marginTop: 8 }}>
              <thead><tr><th>Project</th><th>Inspector</th><th>Why</th></tr></thead>
              <tbody>{result.solver.assignments.map((a) => (
                <tr key={a.project_id}><td>{a.project_id}</td><td>{a.inspector_id}</td><td className="muted">{a.reason}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card">
            <h2>Randomised priorities</h2>
            <div className="log">{Object.entries(result.solver.priorities).map(([p, v]) => `${p}  ${v}`).join('\n')}</div>
            <h2 style={{ marginTop: 12 }}>Excluded pairs ({result.solver.excluded_pairs.length})</h2>
            <div className="log">{result.solver.excluded_pairs.map((e) => `${e.project_id} ✗ ${e.inspector_id}: ${e.reasons.join(', ')}`).join('\n') || 'none'}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>All assignments</h2>
        <Status loading={list.loading} error={list.error} />
        {list.data && (
          <table>
            <thead><tr><th>Project</th><th>Inspector</th><th>Distance</th><th>Created</th><th>Due</th><th>Status</th></tr></thead>
            <tbody>{list.data.map((a) => (
              <tr key={a.id}>
                <td><b>{a.project_name}</b><div className="muted">{a.district}, {a.state}</div></td>
                <td>{a.inspector_name}<div className="muted">{a.team}</div></td>
                <td>{a.distance_km} km</td>
                <td>{fmt(a.created_at)}</td>
                <td>{fmt(a.due_at)}</td>
                <td><span className={`pill ${STATUS_TONE[a.status]}`}>{a.status.replace('_', ' ')}</span>{a.solver?.trigger === 'scheduled' && <div className="muted">auto</div>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
