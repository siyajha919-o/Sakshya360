import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getSession } from '../api';
import WhepPlayer from '../components/WhepPlayer';
import { fmt, Status, useApi } from '../components/ui';

function Health({ camera }) {
  const o = camera.last_observation;
  return (
    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
      <i className={`dot ${camera.online ? 'on' : 'off'}`} />{camera.online ? 'Online' : `Offline${camera.offline_since ? ` since ${fmt(camera.offline_since)}` : ''}`}
      {camera.last_checked && ` · checked ${fmt(camera.last_checked)}`}
      {!camera.online && camera.last_error && ` · ${camera.last_error}`}
      {camera.source === 'simulated' && ' · simulated feed'}
      {o && <> · auto-count {fmt(o.ts)}: <b>{o.persons}</b> people (expected ≈ {o.expected}){o.suspicious && camera.source !== 'simulated' && <span className="pill red" style={{ marginLeft: 4 }}>low</span>}</>}
    </div>
  );
}

function CameraTile({ camera, onChange }) {
  const isOfficial = getSession().user.role === 'official';
  const player = useRef(null);
  const overlay = useRef(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  // Grab the current WebRTC frame, send it to OpenCV (via API) and draw the detections.
  const analyze = async (save) => {
    const video = player.current && player.current.video;
    if (!video || !video.videoWidth) { setResult({ error: 'No live frame yet' }); return; }
    setBusy(true);
    try {
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
      const form = new FormData();
      form.append('frame', blob, 'frame.jpg');
      form.append('save', String(save));
      const r = await api(`/cctv/${camera.id}/analyze`, { form });
      setResult(r);
      const o = overlay.current, ctx = o.getContext('2d');
      o.width = c.width; o.height = c.height;
      ctx.clearRect(0, 0, o.width, o.height);
      ctx.strokeStyle = '#00ff66'; ctx.lineWidth = 3;
      // The ML service downsizes frames to 640 px on the long side; scale boxes back up.
      const k = Math.max(c.width, c.height) > 640 ? Math.max(c.width, c.height) / 640 : 1;
      r.boxes.forEach(([x, y, w, h]) => ctx.strokeRect(x * k, y * k, w * k, h * k));
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setBusy(false);
    }
  };

  const outage = async (down) => {
    setBusy(true);
    try { await api(`/cctv/${camera.id}/simulate-outage`, { body: { down } }); setResult({ note: down ? 'Feed cut. The health check marks it offline after two failed probes (about a minute).' : 'Feed restored. It comes back online at the next health check.' }); onChange(); } catch (e) { setResult({ error: e.message }); } finally { setBusy(false); }
  };

  return (
    <div className="card" style={{ padding: 10 }}>
      <div className="cam">
        <WhepPlayer ref={player} camera={camera} />
        <canvas ref={overlay} className="overlay" />
        <span className="tag">{camera.id} · {camera.label}</span>
      </div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className="muted">{camera.project_name}</span>
        <div className="row">
          <button className="btn ghost sm" disabled={!camera.online || busy} onClick={() => analyze(false)}>Count people</button>
          <button className="btn ghost sm" disabled={!camera.online || busy} onClick={() => analyze(true)}>Save evidence</button>
          {isOfficial && camera.source === 'simulated' && (
            <button className="btn ghost sm" disabled={busy} title="Demo: cut or restore this simulated feed" onClick={() => outage(camera.online)}>{camera.online ? 'Cut feed' : 'Restore feed'}</button>
          )}
        </div>
      </div>
      <Health camera={camera} />
      {result && (result.error ? <div className="error" style={{ fontSize: 13 }}>{result.error}</div> : result.note ? <div className="muted" style={{ fontSize: 13 }}>{result.note}</div> : (
        <div style={{ fontSize: 13, marginTop: 6 }}>
          OpenCV detected <b>{result.persons}</b> person(s) · register today {result.registerCount} · expected visible ≈ {result.expectedVisible}{' '}
          {result.suspicious ? <span className="pill red">Occupancy far below register</span> : <span className="pill green">Consistent</span>}
          {result.evidenceId && <span className="pill" style={{ marginLeft: 6 }}>Saved to evidence</span>}
        </div>
      ))}
    </div>
  );
}

export default function Cctv() {
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const projects = useApi(() => api('/projects'));
  const cams = useApi(() => api(`/cctv/cameras${projectId ? `?projectId=${projectId}` : ''}`), [projectId]);
  const health = useApi(() => api('/cctv/health'));
  const offline = (cams.data || []).filter((c) => !c.online);

  return (
    <>
      <div className="topline">
        <div>
          <h1>CCTV surveillance</h1>
          <div className="muted">Live WebRTC streams from project cameras (MediaMTX), with OpenCV person counting · every camera health-checked over RTSP</div>
          {health.data && <div className="muted">Media server: <span className={`pill ${health.data.mediaServer === 'up' ? 'green' : health.data.mediaServer === 'down' ? 'red' : ''}`}>{health.data.mediaServer}</span>{health.data.lastRun && ` · last health check ${fmt(health.data.lastRun)}`}{cams.data && ` · ${offline.length} of ${cams.data.length} cameras offline`}</div>}
        </div>
        <select value={projectId} onChange={(e) => setParams(e.target.value ? { project: e.target.value } : {})}>
          <option value="">All projects (8 cameras, offline first)</option>
          {(projects.data || []).map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
      </div>
      <Status loading={cams.loading} error={cams.error} />
      {cams.data && (
        <div className="cams">
          {(projectId ? cams.data : [...offline.slice(0, 2), ...cams.data.filter((c) => c.online)].slice(0, 8)).map((c) => <CameraTile key={c.id} camera={c} onChange={cams.reload} />)}
        </div>
      )}
    </>
  );
}
