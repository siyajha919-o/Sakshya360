// Expo push notifications. Devices register their Expo push token after sign-in; we address them by
// subject (user / person id), by project (NGO devices) or by jurisdiction (monitoring officials).
const { query } = require('../db/pg');
const { expoPushUrl, expoAccessToken } = require('../config');

const isExpoToken = t => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(t);

async function register(user, { token, platform, lang }) {
  await query(
    `INSERT INTO push_tokens (token, subject, role, project_id, state, district, platform, lang, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (token) DO UPDATE SET subject = EXCLUDED.subject, role = EXCLUDED.role, project_id = EXCLUDED.project_id,
       state = EXCLUDED.state, district = EXCLUDED.district, platform = EXCLUDED.platform, lang = EXCLUDED.lang, updated_at = now()`,
    [token, user.id, user.role, user.projectId || null, user.state || null, user.district || null, platform || null, lang || 'en']);
}

const unregister = token => query('DELETE FROM push_tokens WHERE token = $1', [token]);

// msg: { title, body, data, channelId?, priority? }  – `title`/`body` may be { en, hi } objects.
async function deliver(rows, msg) {
  if (!rows.length) return { sent: 0 };
  const pick = (v, lang) => (v && typeof v === 'object' ? v[lang] || v.en : v);
  const messages = rows.map(r => ({
    to: r.token,
    title: pick(msg.title, r.lang),
    body: pick(msg.body, r.lang),
    data: msg.data || {},
    sound: 'default',
    priority: msg.priority || 'high',
    channelId: msg.channelId || 'default',
    ttl: msg.ttl || 3600,
  }));
  let sent = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(expoPushUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(expoAccessToken && { Authorization: `Bearer ${expoAccessToken}` }) },
        body: JSON.stringify(chunk),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      (body.data || []).forEach((ticket, j) => {
        if (ticket.status === 'ok') sent++;
        else if (ticket.details && ticket.details.error === 'DeviceNotRegistered') unregister(chunk[j].to).catch(() => {});
      });
    } catch (e) {
      console.warn(`push: ${e.message}`);
    }
  }
  return { sent };
}

const toSubjects = async (subjects, msg) =>
  deliver((await query('SELECT token, lang FROM push_tokens WHERE subject = ANY($1)', [subjects])).rows, msg);

const toProjectNgo = async (projectId, msg) =>
  deliver((await query(`SELECT token, lang FROM push_tokens WHERE role = 'ngo' AND project_id = $1`, [projectId])).rows, msg);

// Officials everywhere, plus the state and district authorities whose area contains the project.
const toMonitors = async (project, msg) => deliver((await query(
  `SELECT token, lang FROM push_tokens WHERE role = 'official'
      OR (role = 'state' AND state = $1) OR (role = 'district' AND state = $1 AND district = $2)`,
  [project.state, project.district])).rows, msg);

module.exports = { isExpoToken, register, unregister, toSubjects, toProjectNgo, toMonitors };
