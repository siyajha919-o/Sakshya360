// npm run demo:reports – files three demo inspection reports through the running API (no phone needed).
const base = (process.env.API_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');

(async () => {
  const login = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'official@dosje.gov.in', password: 'demo@123' }),
  }).catch(() => null);
  if (!login || !login.ok) throw new Error(`Cannot sign in at ${base} – is the API running (npm run api)?`);
  const { token } = await login.json();
  const res = await fetch(`${base}/api/demo/reports`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  for (const c of body.created) console.log(`${c.reportId}  ${c.projectId}  ${c.inspector.padEnd(16)} ${c.withinFence ? 'on-site      ' : 'OUTSIDE FENCE'}  compliance ${c.score}%`);
  console.log('Open the Reports page: http://localhost:5180/reports');
})().catch(e => { console.error(e.message); process.exit(1); });
