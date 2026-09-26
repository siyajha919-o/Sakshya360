import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getSocket } from '../api';
import { RiskMap } from '../components/RiskMap';
import { fmt, Occupancy, RiskPill, Status, useApi } from '../components/ui';

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi(() => api('/dashboard'));
  const [feed, setFeed] = useState([]);

  // Real-time: refresh on new reports/assignments and keep a live alert feed.
  useEffect(() => {
    const s = getSocket();
    const add = (item) => setFeed((f) => [{ ...item, at: Date.now() }, ...f].slice(0, 30));
    const onAlert = (a) => { add(a); reload(); };
    const onReport = (r) => { add({ sev: 'info', code: 'REPORT', projectId: r.projectId, text: `${r.inspector} submitted (score ${r.score}%)` }); reload(); };
    const onRefresh = () => reload();
    const onVc = (v) => add({ sev: 'info', code: 'VC', projectId: '', text: `Random VC answered in ${v.seconds}s` });
    s.on('alert', onAlert); s.on('report:new', onReport); s.on('dashboard:refresh', onRefresh); s.on('vc:answered', onVc);
    return () => { s.off('alert', onAlert); s.off('report:new', onReport); s.off('dashboard:refresh', onRefresh); s.off('vc:answered', onVc); };
  }, [reload]);

  if (!data) return <Status loading={loading} error={error} />;
  const { kpis } = data;
  const projects = [...data.projects].sort((a, b) => (b.analysis.risk ?? -1) - (a.analysis.risk ?? -1));

  return (
    <>
      <div className="topline">
        <div><h1>Real-time monitoring</h1><div className="muted">Projects under DoSJE schemes · {data.scope} · updates live</div></div>
        <span className={`pill ${data.mlOnline ? 'green' : 'amber'}`}>{data.mlOnline ? 'AI models online' : 'AI service offline'}</span>
      </div>

      <div className="grid g4">
        <div className="card kpi"><div className="v">{kpis.projects}</div><div className="l">Projects monitored</div></div>
        <div className="card kpi"><div className="v" style={{ color: kpis.camerasOnline < kpis.camerasTotal ? 'var(--amber)' : 'var(--ok)' }}>{kpis.camerasOnline}/{kpis.camerasTotal}</div><div className="l">CCTV cameras online</div></div>
        <div className="card kpi"><div className="v" style={{ color: 'var(--red)' }}>{kpis.highRisk}</div><div className="l">High-risk projects · {kpis.highAlerts} alerts</div></div>
        <div className="card kpi"><div className="v">{kpis.openAssignments}</div><div className="l">Open surprise inspections · {kpis.reportsToday} reports today</div></div>
      </div>
      <div className="grid g4" style={{ marginTop: 14 }}>
        <div className="card kpi"><div className="v" style={{ color: kpis.overdueAssignments ? 'var(--red)' : undefined }}>{kpis.overdueAssignments}</div><div className="l">Overdue inspections</div></div>
        <div className="card kpi"><div className="v" style={{ color: kpis.geoFailsToday ? 'var(--red)' : undefined }}>{kpis.geoFailsToday}</div><div className="l">Geofence failures today</div></div>
        <div className="card kpi click" onClick={() => navigate('/grievances')}><div className="v" style={{ color: kpis.openGrievances ? 'var(--amber)' : undefined }}>{kpis.openGrievances}</div><div className="l">Open beneficiary grievances</div></div>
        <div className="card kpi"><div className="v">{kpis.camerasTotal - kpis.camerasOnline}</div><div className="l">Cameras offline (health-checked)</div></div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card span2"><h2>Risk map</h2><RiskMap projects={projects} /></div>
        <div className="card">
          <h2>Live alerts</h2>
          <div className="feed">
            {feed.length === 0 && <div className="muted">Waiting for events… Alerts from inspections, attendance and VCs appear here instantly.</div>}
            {feed.map((f, i) => (
              <div key={i} className={`item ${f.sev}`}>
                <b>{f.code}</b> {f.projectId} <span className="muted">{new Date(f.at).toLocaleTimeString('en-IN')}</span><div>{f.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card span2">
          <h2>Projects by AI risk</h2>
          <table>
            <thead><tr><th>Project</th><th>Location</th><th>Avg attendance</th><th>Flags</th><th>Risk</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="click" onClick={() => navigate(`/projects/${p.id}`)}>
                  <td><b>{p.name}</b><div className="muted">{p.id} · {p.scheme} · {p.ngo}</div></td>
                  <td>{p.district}, {p.state}</td>
                  <td style={{ minWidth: 140 }}><Occupancy analysis={p.analysis} sanctioned={p.sanctioned} /></td>
                  <td>{p.analysis.flags.map((f) => <span key={f.code} className={`pill ${f.sev === 'high' ? 'red' : 'amber'}`} style={{ margin: 2 }}>{f.code}</span>)}</td>
                  <td><RiskPill analysis={p.analysis} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Latest inspection reports</h2>
          {data.recentReports.length === 0 && <div className="muted">No reports yet.</div>}
          {data.recentReports.map((r) => (
            <div key={r.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="row between"><b>{r.project_name}</b><span className={`pill ${r.within_fence ? 'green' : 'red'}`}>{r.within_fence ? 'On-site' : 'Geo mismatch'}</span></div>
              <div className="muted">{r.inspector} · {fmt(r.submitted_at)} · score {r.score}%</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
