import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, getSession } from '../api';
import { Flags, fmt, RiskPill, Status, useApi } from '../components/ui';

export default function Analytics() {
  const isOfficial = getSession().user.role === 'official';
  const { data, error, loading } = useApi(() => api('/analytics'));
  const audit = useApi(() => (isOfficial ? api('/audit') : Promise.resolve([])));
  const [chain, setChain] = useState(null);

  if (!data) return <Status loading={loading} error={error} />;
  const m = data.model;
  const flagged = data.projects.filter((p) => p.analysis.flags.length || (p.analysis.risk ?? 0) >= 30).sort((a, b) => (b.analysis.risk ?? 0) - (a.analysis.risk ?? 0));
  const perType = m ? Object.entries(m.per_fraud_type).map(([t, v]) => ({ type: t.replace(/_/g, ' '), classifier: v.classifier_auc, autoencoder: v.autoencoder_auc })) : [];
  const mal = m && m.risk_classifier.report.malpractice;

  return (
    <>
      <div className="topline"><div><h1>AI anomaly & attendance analytics</h1><div className="muted">scikit-learn risk model · PyTorch attendance autoencoder · OpenCV face verification</div></div></div>

      {m ? (
        <div className="grid g3">
          <div className="card">
            <h2>Model card</h2>
            <table><tbody>
              <tr><td>Risk classifier ROC-AUC</td><td><b>{m.risk_classifier.roc_auc}</b></td></tr>
              <tr><td>Malpractice precision / recall</td><td><b>{mal.precision.toFixed(2)} / {mal.recall.toFixed(2)}</b></td></tr>
              <tr><td>Malpractice F1</td><td><b>{mal['f1-score'].toFixed(2)}</b></td></tr>
              <tr><td>Autoencoder ROC-AUC</td><td><b>{m.attendance_autoencoder.roc_auc}</b></td></tr>
              <tr><td>Training / test centres</td><td>{m.samples - m.test_samples} / {m.test_samples}</td></tr>
            </tbody></table>
            <div className="muted" style={{ marginTop: 8 }}>Trained on synthetic centres. Retrain on labelled historical inspection outcomes before operational use.</div>
          </div>
          <div className="card span2">
            <h2>Detection by malpractice pattern (ROC-AUC)</h2>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={perType}>
                <CartesianGrid stroke="#eef0f3" />
                <XAxis dataKey="type" fontSize={11} />
                <YAxis domain={[0.4, 1]} fontSize={11} />
                <Tooltip />
                <Legend />
                <Bar dataKey="classifier" name="Gradient Boosting" fill="#173463" />
                <Bar dataKey="autoencoder" name="Autoencoder" fill="#ff9933" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : <div className="card"><span className="pill amber">ML service offline</span></div>}

      <h2 style={{ marginTop: 18 }}>Flagged projects</h2>
      <div className="grid g2">
        {flagged.map((p) => (
          <div key={p.id} className="card">
            <div className="row between"><Link to={`/projects/${p.id}`}><b>{p.name}</b></Link><RiskPill analysis={p.analysis} /></div>
            <div className="muted">{p.district} · {p.scheme}{p.analysis.probability != null && ` · P(malpractice) ${Math.round(p.analysis.probability * 100)}% · AE ${p.analysis.sequenceScore}`}</div>
            <Flags flags={p.analysis.flags} />
          </div>
        ))}
      </div>

      {isOfficial && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="row between">
            <h2 style={{ margin: 0 }}>Audit trail (hash-chained, append-only)</h2>
            <div className="row">
              {chain && <span className={`pill ${chain.ok ? 'green' : 'red'}`}>{chain.ok ? `${chain.checked} entries intact` : `Broken at #${chain.brokenAt}`}</span>}
              <button className="btn ghost sm" onClick={async () => setChain(await api('/audit/verify'))}>Verify chain</button>
            </div>
          </div>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th><th>Hash</th></tr></thead>
            <tbody>{(audit.data || []).slice(0, 40).map((e) => (
              <tr key={e.id}><td>{fmt(e.ts)}</td><td>{e.actor} <span className="muted">{e.role}</span></td><td><span className="pill">{e.action}</span></td>
                <td className="mono">{JSON.stringify(e.detail)}</td><td className="mono">{e.hash.slice(0, 12)}…</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
