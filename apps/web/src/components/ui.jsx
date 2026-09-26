import { useCallback, useEffect, useState } from 'react';

export const fmt = (t) => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const km = (m) => (m >= 5000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

export function RiskPill({ analysis }) {
  if (analysis.risk == null) return <span className="pill">ML offline</span>;
  return <span className={`pill ${analysis.band}`}>Risk {analysis.risk}</span>;
}

export function Flags({ flags }) {
  if (!flags.length) return <span className="muted">No anomalies detected</span>;
  return flags.map((f, i) => (
    <div key={i} style={{ marginTop: 6 }}>
      <span className={`pill ${f.sev === 'high' ? 'red' : 'amber'}`}>{f.code}</span> <span style={{ fontSize: 13 }}>{f.text}</span>
    </div>
  ));
}

export function Occupancy({ analysis, sanctioned }) {
  const o = analysis.occupancy;
  return (
    <div className="row" style={{ flexWrap: 'nowrap' }}>
      <div className="bar" style={{ flex: 1 }}><i className={o > 100 ? 'bad' : o < 60 ? 'warn' : ''} style={{ width: `${Math.min(100, o)}%` }} /></div>
      <span className="muted">{analysis.avg}/{sanctioned}</span>
    </div>
  );
}

// Minimal data hook: { data, error, loading, reload }.
export function useApi(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn().then((data) => setState({ data, error: null, loading: false }), (error) => setState({ data: null, error, loading: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function Status({ loading, error }) {
  if (error) return <div className="card error">{error.message}</div>;
  if (loading) return <div className="card muted">Loading…</div>;
  return null;
}
