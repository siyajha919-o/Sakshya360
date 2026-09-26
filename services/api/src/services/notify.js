// Real-time fan-out: socket.io rooms scoped by jurisdiction + Expo push for things that must reach a
// phone even when the app is closed (incoming VC, new duties, high-severity alerts).
const { query } = require('../db/pg');
const push = require('./push');

let io = null;
const setIo = server => { io = server; };

// Room names. Every monitoring user also joins 'monitor' for non-sensitive refresh events.
const rooms = {
  official: 'scope:official',
  state: s => `scope:state:${s}`,
  district: (s, d) => `scope:district:${s}:${d}`,
  inspector: id => `inspector:${id}`,
  project: id => `project:${id}`,
};

function joinRooms(socket, u) {
  if (['official', 'state', 'district'].includes(u.role)) socket.join('monitor');
  if (u.role === 'official') socket.join(rooms.official);
  if (u.role === 'state') socket.join(rooms.state(u.state));
  if (u.role === 'district') socket.join(rooms.district(u.state, u.district));
  if (u.role === 'inspector') socket.join(rooms.inspector(u.id));
  if (u.role === 'ngo') socket.join(rooms.project(u.projectId));
}

const projectCache = new Map();
async function project(id) {
  if (!projectCache.has(id)) {
    const p = (await query('SELECT id, name, state, district FROM projects WHERE id = $1', [id])).rows[0];
    if (!p) return null;
    projectCache.set(id, p);
  }
  return projectCache.get(id);
}
const monitorRooms = p => [rooms.official, rooms.state(p.state), rooms.district(p.state, p.district)];

// Emit an event to the monitoring users who can see this project.
async function toMonitors(projectId, event, payload) {
  const p = await project(projectId);
  if (io && p) io.to(monitorRooms(p)).emit(event, payload);
  return p;
}

const refresh = reason => io && io.to('monitor').emit('dashboard:refresh', { reason });

// alert: { sev: 'high' | 'med' | 'info', code, projectId, text }
async function alert(a) {
  const payload = { ...a, at: new Date().toISOString() };
  const p = await toMonitors(a.projectId, 'alert', payload);
  if (p && a.sev === 'high') {
    push.toMonitors(p, {
      title: { en: `⚠ ${a.code.replace(/_/g, ' ')} · ${p.id}`, hi: `⚠ चेतावनी · ${p.id}` },
      body: `${p.name}: ${a.text}`,
      data: { type: 'alert', projectId: p.id, code: a.code },
      channelId: 'alerts',
    }).catch(() => {});
  }
}

function toInspector(inspectorId, event, payload, pushMsg) {
  if (io) io.to(rooms.inspector(inspectorId)).emit(event, payload);
  if (pushMsg) push.toSubjects([inspectorId], pushMsg).catch(() => {});
}

function toProject(projectId, event, payload, pushMsg) {
  if (io) io.to(rooms.project(projectId)).emit(event, payload);
  if (pushMsg) push.toProjectNgo(projectId, pushMsg).catch(() => {});
}

module.exports = { setIo, joinRooms, toMonitors, refresh, alert, toInspector, toProject, project };
