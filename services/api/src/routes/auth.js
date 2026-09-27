const { Router } = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pg');
const config = require('../config');
const { sign, requireRole } = require('../middleware/auth');
const { HttpError } = require('../middleware/errors');
const { rateLimit } = require('../middleware/rateLimit');
const { audit } = require('../services/audit');
const push = require('../services/push');

const r = Router();
const MINUTE = 60 * 1000;

const sessionFor = user => ({
  token: sign(user),
  user: { id: user.id, name: user.name, role: user.role, projectId: user.project_id, state: user.state, district: user.district, team: user.team },
});

// ---------------------------------------------------------------- password (demo / fallback)
const loginLimit = rateLimit({ windowMs: 15 * MINUTE, max: 10, key: req => `${req.ip}:${String((req.body || {}).email || '').toLowerCase()}` });

r.post('/login', loginLimit, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new HttpError(400, 'Email and password required');
  const { rows } = await query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) throw new HttpError(401, 'Invalid credentials');
  await audit(user, 'LOGIN', { email: user.email, method: 'password' });
  res.json(sessionFor(user));
});

r.get('/me', requireRole(), async (req, res) => {
  if (req.user.role === 'beneficiary') {
    const p = (await query('SELECT pe.id, pe.name, pe.project_id, pr.name AS project_name FROM people pe JOIN projects pr ON pr.id = pe.project_id WHERE pe.id = $1', [req.user.id])).rows[0];
    if (!p) throw new HttpError(404, 'User not found');
    return res.json({ ...p, role: 'beneficiary' });
  }
  const { rows } = await query(
    `SELECT u.id, u.name, u.email, u.role, u.project_id, u.state, u.district, u.team, u.capacity,
            ST_Y(u.base_location::geometry) AS lat, ST_X(u.base_location::geometry) AS lng
     FROM users u WHERE u.id = $1`, [req.user.id]);
  if (!rows[0]) throw new HttpError(404, 'User not found');
  res.json(rows[0]);
});

// What sign-in methods the clients should offer.
r.get('/auth/config', (_req, res) => {
  const o = config.oidc;
  res.json({ sso: { enabled: !!(o.issuer && o.clientId && o.redirectUri), label: o.label }, otp: true, demo: !config.production });
});

// ---------------------------------------------------------------- beneficiary OTP
const phone10 = p => String(p || '').replace(/\D/g, '').slice(-10);
const otpHash = (phone, code) => crypto.createHmac('sha256', config.jwtSecret).update(`${phone}:${code}`).digest('hex');
const otpLimitPhone = rateLimit({ windowMs: 15 * MINUTE, max: 5, key: req => `otp:${phone10((req.body || {}).phone)}` });
const otpLimitIp = rateLimit({ windowMs: 15 * MINUTE, max: 20, key: req => `otp-ip:${req.ip}` });

async function sendSms(to, message) {
  if (!config.smsWebhookUrl) return false;
  const res = await fetch(config.smsWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(config.smsWebhookToken && { Authorization: `Bearer ${config.smsWebhookToken}` }) },
    body: JSON.stringify({ to: `+91${to}`, message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new HttpError(502, 'SMS gateway error');
  return true;
}

r.post('/auth/otp/request', otpLimitIp, otpLimitPhone, async (req, res) => {
  const phone = phone10(req.body && req.body.phone);
  if (phone.length !== 10) throw new HttpError(400, 'Enter a 10-digit mobile number');
  const person = (await query(`SELECT id FROM people WHERE kind = 'beneficiary' AND right(regexp_replace(phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`, [phone])).rows[0];
  // Same response whether or not the number is registered, so the endpoint cannot be used to probe the register.
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  let sent = false;
  if (person) {
    await query(`INSERT INTO otp_codes (phone, code_hash, expires_at, attempts) VALUES ($1,$2, now() + interval '5 minutes', 0)
                 ON CONFLICT (phone) DO UPDATE SET code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`, [phone, otpHash(phone, code)]);
    sent = await sendSms(phone, `${code} is your Sakshya360 OTP. Valid for 5 minutes. Do not share it. – DoSJE`);
  }
  res.json({ ok: true, expiresInS: 300, ...(!sent && person && config.exposeDevOtp && { devOtp: code }) });
});

r.post('/auth/otp/verify', otpLimitIp, async (req, res) => {
  const phone = phone10(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '');
  const row = (await query('UPDATE otp_codes SET attempts = attempts + 1 WHERE phone = $1 RETURNING code_hash, expires_at, attempts', [phone])).rows[0];
  if (!row || row.expires_at < new Date() || row.attempts > 5) throw new HttpError(401, 'OTP expired – request a new one');
  const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash), Buffer.from(otpHash(phone, code)));
  if (!ok) throw new HttpError(401, 'Incorrect OTP');
  await query('DELETE FROM otp_codes WHERE phone = $1', [phone]);
  const p = (await query(
    `SELECT pe.id, pe.name, pe.project_id, pr.name AS project_name, pr.state, pr.district FROM people pe JOIN projects pr ON pr.id = pe.project_id
     WHERE pe.kind = 'beneficiary' AND right(regexp_replace(pe.phone, '\\D', '', 'g'), 10) = $1 LIMIT 1`, [phone])).rows[0];
  if (!p) throw new HttpError(401, 'Number not registered');
  const user = { id: p.id, role: 'beneficiary', project_id: p.project_id, state: p.state, district: p.district, name: p.name };
  await audit(user, 'LOGIN', { method: 'otp' });
  res.json({ token: sign(user, '30d'), user: { id: p.id, name: p.name, role: 'beneficiary', projectId: p.project_id, projectName: p.project_name } });
});

// ---------------------------------------------------------------- Parichay / Jan Parichay SSO (OIDC)
// Authorization-code flow with PKCE. State lives in memory for 10 minutes (use a shared store when scaling out).
const pending = new Map();
let discovery = null;
async function discover() {
  if (!discovery) {
    const res = await fetch(`${config.oidc.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new HttpError(502, 'SSO provider unavailable');
    discovery = await res.json();
  }
  return discovery;
}
const ssoEnabled = () => !!(config.oidc.issuer && config.oidc.clientId && config.oidc.redirectUri);
const b64url = buf => buf.toString('base64url');

r.get('/auth/sso/start', async (_req, res) => {
  if (!ssoEnabled()) throw new HttpError(404, 'SSO not configured');
  const d = await discover();
  const state = b64url(crypto.randomBytes(24));
  const verifier = b64url(crypto.randomBytes(32));
  const nonce = b64url(crypto.randomBytes(16));
  pending.set(state, { verifier, nonce, exp: Date.now() + 10 * MINUTE });
  for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k);
  const q = new URLSearchParams({
    response_type: 'code', client_id: config.oidc.clientId, redirect_uri: config.oidc.redirectUri, scope: config.oidc.scope,
    state, nonce, code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  res.redirect(`${d.authorization_endpoint}?${q}`);
});

r.get('/auth/sso/callback', async (req, res) => {
  const fail = msg => res.redirect(`${config.publicWebUrl}/login#error=${encodeURIComponent(msg)}`);
  const st = pending.get(String(req.query.state || ''));
  pending.delete(String(req.query.state || ''));
  if (!ssoEnabled() || !st || st.exp < Date.now()) return fail('Sign-in expired, please try again');
  if (req.query.error) return fail(String(req.query.error_description || req.query.error));
  const d = await discover();
  const tokenRes = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: String(req.query.code || ''), redirect_uri: config.oidc.redirectUri,
      client_id: config.oidc.clientId, client_secret: config.oidc.clientSecret, code_verifier: st.verifier,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.access_token) return fail('SSO token exchange failed');
  // Identity from the provider's userinfo endpoint over TLS, authenticated with the fresh access token.
  const infoRes = await fetch(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(10000) });
  const info = await infoRes.json().catch(() => ({}));
  if (!infoRes.ok || !info.email || info.email_verified === false) return fail('SSO account has no verified e-mail');
  const user = (await query('SELECT * FROM users WHERE lower(email) = lower($1)', [info.email])).rows[0];
  if (!user) return fail(`${info.email} is not registered in Sakshya360`);
  await audit(user, 'LOGIN', { email: user.email, method: 'sso' });
  // Fragment, not query string: never sent to servers or written to access logs.
  res.redirect(`${config.publicWebUrl}/login#sso=${b64url(Buffer.from(JSON.stringify(sessionFor(user))))}`);
});

// ---------------------------------------------------------------- push tokens
r.post('/push/register', requireRole(), async (req, res) => {
  const { token, platform, lang } = req.body || {};
  if (!push.isExpoToken(String(token || ''))) throw new HttpError(400, 'Expo push token required');
  await push.register(req.user, { token, platform: String(platform || '').slice(0, 20), lang: lang === 'hi' ? 'hi' : 'en' });
  res.json({ ok: true });
});

r.post('/push/unregister', requireRole(), async (req, res) => {
  await push.unregister(String((req.body || {}).token || ''));
  res.json({ ok: true });
});

module.exports = r;
