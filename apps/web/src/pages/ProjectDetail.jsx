import { Link, useNavigate, useParams } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { Flags, fmt, RiskPill, Status, useApi } from '../components/ui';

// Opens a printable A4 poster (Hindi + English) with the centre's anonymous-feedback QR code.
async function printQrPoster(p) {
  const { svg, url } = await api(`/projects/${p.id}/feedback-qr`);
  const w = window.open('', '_blank');
  if (!w) return;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Feedback QR · ${esc(p.id)}</title>
    <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px;color:#0b1d3a}
    .band{height:10px;background:linear-gradient(90deg,#ff9933 33%,#fff 33% 66%,#138808 66%);margin:12px 0}
    .qr{width:320px;margin:20px auto}h1{margin:4px 0}p{font-size:18px;margin:6px}small{color:#667085;word-break:break-all}</style></head>
    <body><h1>आपकी राय मायने रखती है · Your voice matters</h1><div class="band"></div>
    <h2>${esc(p.name)}</h2><div>${esc(p.scheme)} · ${esc(p.district)}, ${esc(p.state)}</div>
    <div class="qr">${svg}</div>
    <p>सेवाओं, भोजन, स्टाफ़ या फ़र्ज़ी हाज़िरी की शिकायत के लिए स्कैन करें। आपका नाम नहीं माँगा जाएगा।</p>
    <p>Scan to report problems with services, food, staff or fake attendance. You do not need to give your name.</p>
    <div class="band"></div><b>Department of Social Justice &amp; Empowerment · Sakshya360</b><br><small>${esc(url)}</small>
    <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

const FEATURE_LABEL = {
  cv: 'Day-to-day variation', occupancy: 'Occupancy', over_capacity_frac: 'Days over capacity', inspection_spike: 'Inspection-day spike',
  max_abs_z: 'Largest outlier (z)', unique_ratio: 'Distinct daily counts', round_frac: 'Round-number counts', trend: 'Trend',
  complaints: 'Grievances', fund_utilisation: 'Fund utilisation', days_since_inspection: 'Time since inspection',
  camera_offline_frac: 'CCTV downtime', geo_fails: 'Geofence failures', vc_fails: 'Failed VCs / rejected check-ins', headcount_gap: 'Headcount gap',
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, error, loading } = useApi(() => api(`/projects/${id}`), [id]);
  if (!p) return <Status loading={loading} error={error} />;
  const a = p.analysis;
  const anomalous = new Set(a.anomalousDays);
  const series = p.attendance.map((d) => ({ day: d.day.slice(5, 10), full: d.day, count: d.count }));

  return (
    <>
      <div className="topline">
        <div>
          <div className="muted"><Link to="/">Dashboard</Link> / {p.id}</div>
          <h1>{p.name}</h1>
          <div className="muted">{p.scheme} · {p.ngo} · {p.district}, {p.state} · sanctioned {p.sanctioned}</div>
        </div>
        <div className="row">
          <RiskPill analysis={a} />
          <button className="btn ghost" onClick={() => printQrPoster(p)}>Feedback QR poster</button>
          <button className="btn ghost" onClick={() => navigate(`/grievances?project=${p.id}`)}>Grievances ({p.grievances_open})</button>
          <button className="btn ghost" onClick={() => navigate(`/cctv?project=${p.id}`)}>CCTV</button>
          <button className="btn saffron" onClick={() => navigate(`/vc?project=${p.id}`)}>Random VC</button>
        </div>
      </div>

      <div className="grid g4">
        <div className="card kpi"><div className="v">{a.probability != null ? `${Math.round(a.probability * 100)}%` : '—'}</div><div className="l">P(malpractice) · Gradient Boosting</div></div>
        <div className="card kpi"><div className="v">{a.novelty != null ? `${Math.round(a.novelty * 100)}%` : '—'}</div><div className="l">Novelty · Isolation Forest</div></div>
        <div className="card kpi"><div className="v" style={{ color: a.sequenceScore > 1 ? 'var(--red)' : undefined }}>{a.sequenceScore ?? '—'}</div><div className="l">Sequence anomaly · PyTorch AE (&gt;1 abnormal){a.sequenceDirection && a.sequenceScore > 1 ? ` · ${a.sequenceDirection === 'too_regular' ? 'too regular' : 'irregular'}` : ''}</div></div>
        <div className="card kpi"><div className="v">{p.days_since_inspection}d</div><div className="l">Since last inspection</div></div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card span2">
          <h2>Attendance – last 30 days</h2>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#eef0f3" />
              <XAxis dataKey="day" fontSize={11} interval={4} />
              <YAxis fontSize={11} domain={[0, (max) => Math.max(max, p.sanctioned) + 5]} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={p.sanctioned} stroke="#d92d20" strokeDasharray="4 4" label={{ value: 'Sanctioned', fontSize: 11, fill: '#d92d20', position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="count" name="Reported attendance" stroke="#173463" strokeWidth={2} dot={false} />
              {series.filter((s) => anomalous.has(s.full)).map((s) => <ReferenceDot key={s.full} x={s.day} y={s.count} r={5} fill="#d92d20" stroke="none" />)}
            </LineChart>
          </ResponsiveContainer>
          <div className="muted">Red dots: days the autoencoder could not reconstruct (unusual for a genuine centre).</div>
        </div>
        <div className="card">
          <h2>Why this score</h2>
          {a.drivers.length === 0 && <div className="muted">No dominant drivers.</div>}
          {a.drivers.map((d) => (
            <div key={d.feature} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
              <span>{FEATURE_LABEL[d.feature] || d.feature}</span><span className="muted">{d.value}</span>
            </div>
          ))}
          <h2 style={{ marginTop: 16 }}>AI findings</h2>
          <Flags flags={a.flags} />
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h2>Registered people</h2>
          <table><tbody>{p.people.map((x) => (
            <tr key={x.id}><td>{x.name}</td><td className="muted">{x.kind}</td><td><span className={`pill ${x.face_enrolled ? 'green' : 'amber'}`}>{x.face_enrolled ? 'Face enrolled' : 'Not enrolled'}</span></td></tr>
          ))}</tbody></table>
        </div>
        <div className="card">
          <h2>Cameras</h2>
          <table><tbody>{p.cameras.map((c) => (
            <tr key={c.id}><td>{c.label}</td><td className="mono">{c.id}</td><td><span className={`pill ${c.online ? 'green' : 'red'}`}>{c.online ? 'Online' : 'Offline'}</span></td></tr>
          ))}</tbody></table>
          <h2 style={{ marginTop: 14 }}>Automatic CCTV occupancy checks</h2>
          {p.cctvObservations.length === 0 ? <div className="muted">No automatic checks yet.</div> : (
            <table>
              <thead><tr><th>When</th><th>Camera</th><th>People seen</th><th>Expected</th><th /></tr></thead>
              <tbody>{p.cctvObservations.map((o, i) => (
                <tr key={i}><td>{fmt(o.ts)}</td><td className="mono">{o.camera_id}</td><td>{o.persons}</td><td>≈ {o.expected}</td>
                  <td>{o.source === 'simulated' ? <span className="pill">test feed</span> : o.suspicious ? <span className="pill red">Low occupancy</span> : <span className="pill green">OK</span>}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
