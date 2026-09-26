// Client for the Python ML service, with a rule-based fallback so the app keeps working if ML is down.
const ML_URL = process.env.ML_URL || 'http://127.0.0.1:8001';

async function call(pathname, body) {
  const res = await fetch(ML_URL + pathname, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`ML ${pathname} ${res.status}`);
  return res.json();
}

// Converts a project + live signals into the ML service's Centre schema.
function toCentre(p, s) {
  return {
    id: p.id, attendance: p.attendance, sanctioned: p.sanctioned, inspection_days: p.inspectionDays,
    complaints: p.complaints, fund_utilisation: p.fundUtilisation, last_inspected_days_ago: p.lastInspectedDaysAgo,
    cameras_total: p.cameras.length, cameras_offline: p.cameras.filter(c => !c.online).length,
    geo_fails: s.geoFails, vc_fails: s.vcFails, headcount: s.headcount, register_count: s.registerCount,
  };
}

const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
const std = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };

function fallback(c) {
  const a = c.attendance, m = mean(a), sd = std(a), flags = [];
  if (sd / (m || 1) < 0.02) flags.push({ sev: 'high', code: 'PROXY_REGISTER', text: `Attendance identical for ${a.length} days` });
  const over = a.filter(v => v > c.sanctioned).length;
  if (over) flags.push({ sev: 'high', code: 'OVER_CAPACITY', text: `${over} days exceed sanctioned capacity` });
  const idx = c.inspection_days.map(d => a.length - 1 - d);
  const ins = idx.map(i => a[i]).filter(v => v != null), rest = a.filter((_, i) => !idx.includes(i));
  if (ins.length && rest.length && mean(ins) > 1.5 * mean(rest)) flags.push({ sev: 'high', code: 'INSPECTION_DAY_SPIKE', text: 'Attendance spikes on inspection days' });
  if (c.cameras_offline) flags.push({ sev: 'med', code: 'CCTV_OFFLINE', text: `${c.cameras_offline}/${c.cameras_total} cameras offline` });
  if (c.geo_fails) flags.push({ sev: 'high', code: 'GEOFENCE_FAIL', text: `${c.geo_fails} report(s) outside geofence` });
  if (c.vc_fails) flags.push({ sev: 'med', code: 'VC_FAILED', text: `${c.vc_fails} random VC(s) not verified` });
  const risk = Math.min(100, flags.reduce((s, f) => s + (f.sev === 'high' ? 25 : 10), 0) + c.complaints * 4);
  return { id: c.id, risk, probability: null, novelty: null, band: risk >= 60 ? 'high' : risk >= 30 ? 'medium' : 'low', flags, drivers: [], source: 'rules-fallback' };
}

async function scoreCentres(centres) {
  try {
    return (await call('/predict/risk', centres)).map(r => ({ ...r, source: 'ml' }));
  } catch (e) {
    console.warn('ML unavailable, using rule fallback:', e.message);
    return centres.map(fallback);
  }
}

async function headcount(body) {
  try { return await call('/predict/headcount', body); }
  catch {
    const expected = body.register_count * (body.camera_coverage || 0.5);
    const ratio = expected ? body.detected_persons / expected : 1;
    return { expected_visible: expected, ratio: +ratio.toFixed(2), suspicious: body.register_count > 0 && ratio < 0.35 };
  }
}

async function health() {
  try { return { ok: true, ...(await call('/health')) }; } catch (e) { return { ok: false, error: e.message }; }
}
async function metrics() {
  try { return await call('/model/metrics'); } catch { return null; }
}

module.exports = { toCentre, scoreCentres, headcount, health, metrics };
