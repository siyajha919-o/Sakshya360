import { useEffect, useState } from 'react';
import { api, getSession } from '../api';
import { GeofenceMap } from '../components/RiskMap';
import { fmt, km, Status, useApi } from '../components/ui';

function Report({ r }) {
  const [verify, setVerify] = useState({});
  const check = async (id) => {
    setVerify((v) => ({ ...v, [id]: 'checking' }));
    try {
      const res = await api(`/evidence/${id}/verify`);
      setVerify((v) => ({ ...v, [id]: res.intact ? 'intact' : 'TAMPERED' }));
    } catch (e) { setVerify((v) => ({ ...v, [id]: e.message })); }
  };
  const mismatch = r.register_count && r.headcount < r.register_count * 0.7;

  return (
    <div className="card">
      <div className="row between">
        <div>
          <h2 style={{ margin: 0 }}>{r.project_name}</h2>
          <div className="muted">{r.inspector_name} · inspected {fmt(r.captured_at || r.submitted_at)} · {r.district}, {r.state}</div>
          {r.delayed_sync && <div className="muted">Captured offline, received {fmt(r.submitted_at)}</div>}
        </div>
        <div className="row">
          {r.delayed_sync && <span className="pill amber">Offline sync</span>}
          <span className={`pill ${r.within_fence ? 'green' : 'red'}`}>{r.within_fence ? 'On-site ✓' : 'Outside geofence'}</span>
          {r.simulated && <span className="pill amber">Demo location</span>}
          <span className={`pill ${r.score >= 75 ? 'green' : r.score >= 50 ? 'amber' : 'red'}`}>Compliance {r.score}%</span>
          <a className="btn ghost sm" href={r.pdfUrl} target="_blank" rel="noreferrer">⬇ PDF</a>
        </div>
      </div>
      <div className="grid g2" style={{ marginTop: 12 }}>
        <div>
          <GeofenceMap site={[r.site_lat, r.site_lng]} geofence={250} point={[r.lat, r.lng]} withinFence={r.within_fence} />
          <div className="muted" style={{ marginTop: 6 }}>📍 {r.lat.toFixed(5)}, {r.lng.toFixed(5)} ±{Math.round(r.accuracy_m || 0)} m · {km(r.distance_m)} from registered site</div>
        </div>
        <div className="stack">
          <div>Headcount observed <b>{r.headcount}</b> · register claims <b>{r.register_count}</b> {mismatch && <span className="pill red">Mismatch</span>}</div>
          <div>{r.checklist.map((c) => <div key={c.item} style={{ fontSize: 13 }}>{c.ok ? '✅' : '❌'} {c.item}</div>)}</div>
          {r.remarks && <div style={{ fontSize: 14 }}>“{r.remarks}”</div>}
        </div>
      </div>
      <h2 style={{ marginTop: 14 }}>Live evidence ({r.evidence.length})</h2>
      <div className="thumbs">
        {r.evidence.map((e) => (
          <div key={e.id}>
            {e.kind === 'video' ? <video src={e.url} controls /> : <a href={e.url} target="_blank" rel="noreferrer"><img src={e.url} alt="evidence" /></a>}
            <div><button className="btn ghost sm" onClick={() => check(e.id)}>Verify hash</button> <span className={`pill ${verify[e.id] === 'intact' ? 'green' : verify[e.id] ? 'red' : ''}`}>{verify[e.id] || e.sha256.slice(0, 10)}</span></div>
          </div>
        ))}
      </div>
      <div className="mono muted" style={{ marginTop: 8 }}>Report signature {r.signature}</div>
    </div>
  );
}

// Demo mode (non-production API): lets the Division file sample reports without a phone.
function DemoButton({ onDone }) {
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/auth/config').then((c) => setDemo(!!c.demo)).catch(() => {}); }, []);
  if (!demo || getSession().user.role !== 'official') return null;
  const run = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await api('/demo/reports', { method: 'POST' });
      setMsg(`${r.created.length} demo reports filed`);
      onDone();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="row">
      {msg && <span className="muted">{msg}</span>}
      <button className="btn ghost" disabled={busy} onClick={run} title="Files 3 sample inspections (on-site, headcount mismatch, outside geofence) as if submitted from the mobile app">
        {busy ? 'Filing reports…' : '🧪 Create demo reports'}
      </button>
    </div>
  );
}

export default function Reports() {
  const { data, error, loading, reload } = useApi(() => api('/reports'));
  return (
    <>
      <div className="topline">
        <div><h1>Geo-tagged inspection reports</h1><div className="muted">Evidence stored in MongoDB GridFS with SHA-256 fingerprints; location checked with PostGIS</div></div>
        <DemoButton onDone={reload} />
      </div>
      <Status loading={loading} error={error} />
      {data && data.length === 0 && <div className="card muted">No reports yet. Inspectors submit them from the mobile app{getSession().user.role === 'official' ? ' – or use “Create demo reports” to see how they look.' : '.'}</div>}
      <div className="stack">{data && data.map((r) => <Report key={r.id} r={r} />)}</div>
    </>
  );
}
