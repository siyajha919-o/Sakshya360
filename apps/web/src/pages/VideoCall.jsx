import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getSession, getSocket } from '../api';
import { fmt, Status, useApi } from '../components/ui';

const CHECKS = [
  ['identity', 'Face matches registered person'],
  ['premises', 'Premises / signboard shown live'],
  ['beneficiaries', 'Beneficiaries physically present'],
  ['register', 'Attendance register shown on camera'],
];

export const JITSI_UNBRANDED = {
  SHOW_JITSI_WATERMARK: false, SHOW_WATERMARK_FOR_GUESTS: false, SHOW_BRAND_WATERMARK: false, SHOW_POWERED_BY: false,
  SHOW_PROMOTIONAL_CLOSE_PAGE: false, MOBILE_APP_PROMO: false, HIDE_DEEP_LINKING_LOGO: true, JITSI_WATERMARK_LINK: '', DEFAULT_LOGO_URL: '',
};

function loadJitsi(domain) {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://${domain}/external_api.js`;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load Jitsi from ${domain}`));
    document.head.appendChild(s);
  });
}

export default function VideoCall() {
  const [params] = useSearchParams();
  const history = useApi(() => api('/vc'));
  const [session, setSession] = useState(null);
  const [checks, setChecks] = useState({});
  const [answered, setAnswered] = useState(null);
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const container = useRef(null);
  const jitsi = useRef(null);

  const start = async () => {
    setError(''); setChecks({}); setAnswered(null);
    try {
      setSession(await api('/vc/random', { body: params.get('project') ? { projectId: params.get('project') } : {} }));
    } catch (e) { setError(e.message); }
  };

  // Mount Jitsi when a session starts.
  useEffect(() => {
    if (!session) return undefined;
    let disposed = false;
    loadJitsi(session.jitsiDomain).then(() => {
      if (disposed) return;
      jitsi.current = new window.JitsiMeetExternalAPI(session.jitsiDomain, {
        roomName: session.room,
        parentNode: container.current,
        width: '100%', height: '100%',
        userInfo: { displayName: `DoSJE – ${getSession().user.name}` },
        configOverwrite: { prejoinPageEnabled: false, prejoinConfig: { enabled: false }, startWithAudioMuted: false, disableDeepLinking: true, disableInviteFunctions: true },
        // No Jitsi branding inside the Department's verification call.
        interfaceConfigOverwrite: JITSI_UNBRANDED,
      });
    }).catch((e) => setError(e.message));
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => { disposed = true; clearInterval(timer); if (jitsi.current) jitsi.current.dispose(); jitsi.current = null; };
  }, [session]);

  useEffect(() => {
    const s = getSocket();
    const onAnswer = (v) => { if (session && v.id === session.id) setAnswered(v.seconds); };
    s.on('vc:answered', onAnswer);
    return () => s.off('vc:answered', onAnswer);
  }, [session]);

  const close = async (outcome) => {
    try {
      await api(`/vc/${session.id}/close`, { body: { outcome, checks } });
      setSession(null);
      history.reload();
    } catch (e) { setError(e.message); }
  };

  return (
    <>
      <div className="topline">
        <div><h1>Random video verification</h1><div className="muted">The server picks a project and a person at random; they have {session?.answerWindowS || 60}s to join from the mobile app</div></div>
        {!session && <button className="btn saffron" onClick={start}>Start random VC{params.get('project') ? ` (${params.get('project')})` : ''}</button>}
      </div>
      {error && <div className="card error" style={{ marginBottom: 12 }}>{error}</div>}

      {session && (
        <div className="grid g3">
          <div className="card span2" style={{ padding: 10 }}>
            <div className="jitsi" ref={container} />
          </div>
          <div className="card stack">
            <div><b>{session.person_name}</b> <span className="pill">{session.person_kind}</span></div>
            <div className="muted">{session.project_name} · {session.district}, {session.state}</div>
            <div className="row between">
              <span className="mono">{String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}</span>
              {answered == null
                ? <span className={`pill ${elapsed > session.answerWindowS ? 'red' : 'amber'}`}>{elapsed > session.answerWindowS ? 'Not answered in time' : 'Ringing on mobile…'}</span>
                : <span className={`pill ${answered > session.answerWindowS ? 'amber' : 'green'}`}>Answered in {answered}s</span>}
            </div>
            <div>
              <b>Verification checklist</b>
              {CHECKS.map(([k, label]) => (
                <label key={k} className="chk"><input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} /> {k === 'identity' ? `Face matches ${session.person_name}` : label}</label>
              ))}
            </div>
            <div className="row">
              <button className="btn green" onClick={() => close(null)}>Close & record</button>
              <button className="btn red" onClick={() => close('suspicious')}>Flag suspicious</button>
            </div>
            <div className="muted">Room: <span className="mono">{session.room}</span></div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Call history</h2>
        <Status loading={history.loading} error={history.error} />
        {history.data && (
          <table>
            <thead><tr><th>When</th><th>Project</th><th>Person</th><th>Answered</th><th>Outcome</th></tr></thead>
            <tbody>{history.data.map((v) => (
              <tr key={v.id}>
                <td>{fmt(v.started_at)}</td><td>{v.project_name}</td><td>{v.person_name} <span className="muted">({v.person_kind})</span></td>
                <td>{v.answered_at ? `${Math.round((new Date(v.answered_at) - new Date(v.started_at)) / 1000)}s` : '—'}</td>
                <td>{v.outcome ? <span className={`pill ${v.outcome === 'verified' ? 'green' : 'red'}`}>{v.outcome}</span> : <span className="pill amber">open</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
