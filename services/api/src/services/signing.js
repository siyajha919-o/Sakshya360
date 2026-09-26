// HMAC-signed, short-lived URLs so <img>/<video> tags, PDF links and QR codes work without
// putting a session token in the URL.
const crypto = require('crypto');
const { jwtSecret } = require('../config');

const mac = (purpose, id, exp) => crypto.createHmac('sha256', jwtSecret).update(`${purpose}:${id}:${exp}`).digest('base64url');

function sign(purpose, id, ttlSeconds) {
  const exp = ttlSeconds ? Math.floor(Date.now() / 1000) + ttlSeconds : 0; // 0 = does not expire
  return { exp, sig: mac(purpose, id, exp) };
}

function verify(purpose, id, exp, sig) {
  if (!sig || typeof sig !== 'string') return false;
  const e = Number(exp) || 0;
  if (e && e < Date.now() / 1000) return false;
  const expected = Buffer.from(mac(purpose, id, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const signedPath = (purpose, path, id, ttlSeconds) => {
  const { exp, sig } = sign(purpose, id, ttlSeconds);
  return `${path}?exp=${exp}&sig=${sig}`;
};

module.exports = {
  sign, verify, signedPath,
  evidenceUrl: id => signedPath('evidence', `/api/evidence/${id}`, id, 3600),
  reportPdfUrl: id => signedPath('report-pdf', `/api/reports/${id}/pdf`, id, 3600),
  // QR codes are printed and pasted at the centre, so they do not expire (rotate JWT_SECRET to revoke).
  feedbackToken: projectId => sign('feedback', projectId, 0).sig,
};
