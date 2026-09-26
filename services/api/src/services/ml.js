// Client for the FastAPI ML service.
const { mlUrl } = require('../config');

class MlError extends Error {}

async function call(path, { json, form, timeout = 15000 } = {}) {
  let res;
  try {
    res = await fetch(mlUrl + path, {
      method: json || form ? 'POST' : 'GET',
      headers: json ? { 'Content-Type': 'application/json' } : undefined,
      body: json ? JSON.stringify(json) : form,
      signal: AbortSignal.timeout(timeout),
    });
  } catch (e) {
    throw new MlError(`ML service unreachable (${e.message})`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new MlError(body.detail ? JSON.stringify(body.detail) : `ML ${path} failed (${res.status})`);
  return body;
}

function imageForm(fields) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Buffer.isBuffer(v)) form.append(k, new Blob([v], { type: 'image/jpeg' }), `${k}.jpg`);
    else if (v != null) form.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  }
  return form;
}

module.exports = {
  MlError,
  health: () => call('/health', { timeout: 3000 }),
  metrics: () => call('/models/metrics'),
  scoreRisk: centres => call('/risk/score', { json: { centres } }),
  attendanceAnomaly: series => call('/anomaly/attendance', { json: { series } }),
  optimiseAssignment: payload => call('/assign/optimize', { json: payload, timeout: 30000 }),
  faceEmbed: image => call('/face/embed', { form: imageForm({ image }) }),
  faceVerify: (image, reference) => call('/face/verify', { form: imageForm({ image, reference }) }),
  countPeople: image => call('/vision/people-count', { form: imageForm({ image }) }),
  streamCount: url => call('/vision/stream-count', { json: { url, include_frame: true }, timeout: 30000 }),
};
