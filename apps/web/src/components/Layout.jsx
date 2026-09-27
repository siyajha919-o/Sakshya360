import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { closeSocket, getSession, getSocket, scopeLabel, setSession } from '../api';

const NAV = [
  ['/', 'Live dashboard'],
  ['/cctv', 'CCTV surveillance'],
  ['/vc', 'Random VC'],
  ['/assignments', 'Inspection assignment'],
  ['/reports', 'Inspection reports'],
  ['/grievances', 'Beneficiary grievances'],
  ['/analytics', 'AI analytics & audit'],
];

export default function Layout() {
  const { user } = getSession();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const socket = getSocket();
    const push = (t) => {
      const id = Math.random();
      setToasts((xs) => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => setToasts((xs) => xs.filter((x) => x.id !== id)), 6000);
    };
    const onAlert = (a) => push({ sev: a.sev, text: `${a.sev === 'info' ? 'ℹ' : '⚠'} ${a.projectId}: ${a.text}` });
    const onReport = (r) => push({ sev: 'info', text: `📋 New report from ${r.inspector} (${r.projectId})` });
    socket.on('alert', onAlert);
    socket.on('report:new', onReport);
    return () => { socket.off('alert', onAlert); socket.off('report:new', onReport); };
  }, []);

  const logout = () => { closeSocket(); setSession(null); navigate('/login'); };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand"><img src="/favicon.svg" alt="" /><div><b>Sakshya360</b><small>DoSJE Monitoring</small></div></div>
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>
        ))}
        <div className="who">
          <div><b>{user.name}</b></div>
          <div>{scopeLabel(user)}</div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
      <div className="toast">{toasts.map((t) => <div key={t.id} className={t.sev}>{t.text}</div>)}</div>
    </div>
  );
}
