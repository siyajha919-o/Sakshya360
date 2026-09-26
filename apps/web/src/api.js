import { io } from 'socket.io-client';

const KEY = 'sakshya360.web.session';

export function getSession() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
export function setSession(s) {
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}

export async function api(path, { method, body, form, raw } = {}) {
  const s = getSession();
  const headers = {};
  if (s) headers.Authorization = `Bearer ${s.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`/api${path}`, {
    method: method || (body !== undefined || form ? 'POST' : 'GET'),
    headers,
    body: form || (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (res.status === 401 && s && !path.startsWith('/login')) {
    setSession(null);
    window.location.assign('/login');
  }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Evidence and PDF links come from the API already signed (short-lived HMAC), so no token is put in URLs.
export const MONITOR_ROLES = ['official', 'state', 'district'];
export const scopeLabel = (u) => (u.role === 'district' ? `District authority · ${u.district}` : u.role === 'state' ? `State authority · ${u.state}` : 'DoSJE Division');

let socket;
export function getSocket() {
  const s = getSession();
  if (!s) return null;
  if (!socket) socket = io({ auth: { token: s.token } });
  return socket;
}
export function closeSocket() {
  if (socket) socket.disconnect();
  socket = null;
}
