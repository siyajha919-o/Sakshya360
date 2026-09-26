import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, closeSocket, setSession } from '../api';

const DEMO = [
  ['official@dosje.gov.in', 'DoSJE Division official (all India)'],
  ['state.up@dosje.gov.in', 'State authority – Uttar Pradesh only'],
  ['district.lucknow@dosje.gov.in', 'District authority – Lucknow only'],
];

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(DEMO[0][0]);
  const [password, setPassword] = useState('demo@123');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState(null);

  // Returning from Parichay SSO: the API puts the session in the URL fragment (never sent to servers).
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    if (h.get('error')) setError(h.get('error'));
    if (h.get('sso')) {
      try {
        const b64 = h.get('sso').replace(/-/g, '+').replace(/_/g, '/');
        const s = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
        closeSocket();
        setSession(s);
        navigate('/');
        return;
      } catch { setError('SSO sign-in failed'); }
    }
    api('/auth/config').then((c) => setSso(c.sso)).catch(() => {});
  }, [navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const s = await api('/login', { body: { email, password } });
      closeSocket();
      setSession(s);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="card stack" onSubmit={submit}>
        <div className="row"><img src="/favicon.svg" alt="" width="40" /><div><h1>Sakshya360</h1><div className="muted">Smart Monitoring & Inspection · DoSJE, MoSJE</div></div></div>
        <div className="tricolor" />
        {sso?.enabled && (
          <>
            <a className="btn saffron" style={{ width: '100%', textAlign: 'center', textDecoration: 'none' }} href="/api/auth/sso/start">Sign in with {sso.label}</a>
            <div className="muted" style={{ textAlign: 'center' }}>or with a Sakshya360 password</div>
          </>
        )}
        <label className="muted">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        <label className="muted">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <div className="error">{error}</div>}
        <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <div className="muted">
          Demo accounts (password <code>demo@123</code>):
          {DEMO.map(([e, l]) => <div key={e}><a href="#" onClick={(ev) => { ev.preventDefault(); setEmail(e); }}>{e}</a> – {l}</div>)}
          {!sso?.enabled && <div style={{ marginTop: 6 }}>Parichay / Jan Parichay SSO switches on when OIDC_* is set on the API.</div>}
        </div>
      </form>
    </div>
  );
}
