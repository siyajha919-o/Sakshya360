# Sakshya360

Smart real-time monitoring and inspection for projects, institutes and NGOs funded under DoSJE schemes
(SIH problem statement **26095**, Ministry of Social Justice & Empowerment).

| Problem-statement feature | Where it lives |
|---|---|
| Live CCTV feeds | MediaMTX (RTSP in → WebRTC out); web **CCTV** page and mobile **CCTV** tab. Every camera is health-checked over RTSP each minute; outages raise alerts. |
| Random VC with project staff / beneficiaries | Server picks project + person at random; their phone rings (socket + push, even when the app is closed); Jitsi call with a verification checklist. Web and mobile. |
| Real-time dashboard for officials | Web dashboard + mobile **Dashboard** tab: KPIs, risk map, live alert feed, scoped to Division / State / District. |
| Mobile inspection module | Inspector app: geofence lock, in-app camera photos with a burned-in GPS/time watermark, 20 s video, checklist, headcount, signed report, PDF. Works **offline**: reports queue on the phone and upload later. |
| Random assignment through AI / automation | OR-Tools CP-SAT: risk-weighted random priorities with conflict-of-interest, rotation and capacity rules. Runs **daily on a schedule** (configurable) or on demand; overdue duties are marked and escalated automatically. |
| Geo-tagged reports and live evidence | PostGIS geofence check, SHA-256 fingerprint per file (duplicates rejected), signed report, hash-chained audit log, PDF export. |
| AI anomaly and attendance analytics | Gradient-boosting risk model + Isolation Forest + PyTorch attendance autoencoder; OpenCV face-verified attendance; automatic CCTV occupancy checks vs. the register. |
| Stakeholders | Roles: `official` (Division/PMU), `state`, `district`, `inspector` (PMU teams), `ngo`, `beneficiary` (OTP login) + anonymous QR feedback at every centre. |

## Architecture

```
apps/mobile   Expo (React Native) – inspectors, NGOs, officials, beneficiaries · Hindi / English
apps/web      React + Vite dashboard for officials · public QR feedback page
services/api  Node / Express · PostgreSQL+PostGIS · MongoDB GridFS (evidence) · socket.io · background jobs
services/ml   FastAPI · scikit-learn · PyTorch · OpenCV · OR-Tools
infra         docker-compose: Postgres/PostGIS, MongoDB, MediaMTX (+ app services under the `app` profile)
```

## Run locally

Prerequisites: Node 20+, Docker, [uv](https://docs.astral.sh/uv/) (Python 3.11).

```bash
npm run setup          # install all packages, create the ML venv, download face models, train models
npm run infra:up       # Postgres, MongoDB, MediaMTX
npm run ml             # ML service  → :8001
npm run api            # API         → :4000 (migrates + seeds on first start)
npm run web            # dashboard   → http://localhost:5180
npm run mobile         # Expo; scan the QR code (phone on the same Wi-Fi)
```

Upgrading an existing database from an older checkout: `npm run api:reseed` (resets demo data).

For **live CCTV on a phone**, `npm run infra:up` advertises the Mac's Wi-Fi IP to the camera server automatically (override with `HOST_LAN_IP=…`). Re-run it if you change networks.

### Demo accounts (password `demo@123`)

| Role | Login |
|---|---|
| DoSJE Division (all India) | `official@dosje.gov.in` |
| State authority – Uttar Pradesh | `state.up@dosje.gov.in` |
| District authority – Lucknow | `district.lucknow@dosje.gov.in` |
| PMU inspectors | `i01@pmu.sakshya360.in` … `i06@…` |
| NGO / project in-charge | `p101@ngo.sakshya360.in` … `p108@…` |
| Beneficiary (mobile, OTP) | `9000000101` … `9000000108`. Without an SMS gateway the OTP is shown on screen. |

Seeded malpractice for the analytics to find: **P103** copy-paste register, **P106** attendance spikes on inspection days, **P108** over-reporting.

### Demo script

No phone handy? Web → *Inspection reports* → **🧪 Create demo reports** (or `npm run demo:reports` while the API runs) files three
realistic inspections (on site / headcount mismatch + offline sync / 12 km outside the geofence) through the real pipeline.
A full YouTube demo script is in [docs/demo-video-script.md](docs/demo-video-script.md).

1. Web → **Inspection assignment** → *Generate surprise inspections* (or wait for the daily 09:00 IST run).
2. Mobile as the assigned inspector → *Start inspection* → photos (watermarked), checklist, headcount → submit. Turn on airplane mode first to see the offline queue; it uploads when you reconnect.
3. Web dashboard gets the report and any geofence/headcount alerts live → **Reports** → *PDF*.
4. **Random VC** → the NGO phone rings (push if the app is closed) → answer → checklist → outcome.
5. **CCTV** → *Cut feed* on a camera → it goes offline at the next health check and raises an alert.
6. Project page → *Feedback QR poster* → scan with a phone → anonymous grievance → **Grievances** → reply.
7. Mobile → switch **हिं / EN** at any time.

## Tests

```bash
npm test               # API unit tests (node:test) + ML unit tests (unittest)
npm run test:e2e       # full-stack test against a running, freshly seeded API (+ MediaMTX for CCTV checks)
```

## Push notifications

Remote push needs an Expo project ID and a development or production build (Expo Go on Android no
longer supports remote push):

```bash
cd apps/mobile
npx eas init                                   # writes extra.eas.projectId into app.json
npx eas build --profile development -p android # installable dev build (APK)
```

Without these, the app still works. Calls and duties then arrive over the live socket while the app is open.

## AI models

`services/ml/train.py` trains on synthetic centres (no public labelled dataset exists) and writes
`model/metrics.json`: risk classifier ROC-AUC 0.955, autoencoder 0.897. To move to real data, export labelled
snapshots from completed inspections and retrain:

```bash
curl -H "Authorization: Bearer <official token>" http://localhost:4000/api/analytics/training-export > services/ml/labelled.jsonl
npm run ml:retrain-real -- labelled.jsonl           # synthetic + real (real rows weighted 5×)
cd services/ml && .venv/bin/python train.py --real labelled.jsonl --real-only   # once ≥ 50 real centres exist
```

The label comes from what inspectors and VCs found (headcount gap, compliance score, failed VCs), and those
fields are left out of the features so the model cannot see its own answer.

## Deployment

```bash
export JWT_SECRET=$(openssl rand -hex 32) PUBLIC_WEB_URL=https://sakshya360.example.gov.in
npm run app:up         # builds and starts ml, api and web (nginx on :8080) next to the infra services
```

Before going live:

- **TLS**: put an HTTPS reverse proxy in front of `web` (:8080) and `api` (:4000).
- **SSO**: set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI` to enable
  *Sign in with Parichay* (standard OIDC, PKCE). Users are matched by e-mail.
- **SMS**: set `SMS_WEBHOOK_URL` / `SMS_WEBHOOK_TOKEN` for beneficiary OTPs. The API POSTs `{to, message}`,
  so adapt it to the NIC/state SMS gateway. Dev OTP display turns off automatically in production.
- **Cameras**: add real cameras as MediaMTX paths (`source: rtsp://…`), with rows in `cameras` (`source = 'rtsp'`).
  Restrict the MediaMTX control API in `infra/mediamtx.yml` to the API server's address.
- **Jitsi**: point `JITSI_DOMAIN` at a self-hosted Jitsi for data residency.
- **Mobile**: set `EXPO_PUBLIC_API_URL` in `apps/mobile/eas.json`, then `eas build --profile production`.
- On Linux hosts, make `infra/outages` writable by UID 1000 (the API container user).

## Security notes

JWT sessions (12 h, beneficiaries 30 d); the server refuses to start in production with a weak `JWT_SECRET`
or without `CORS_ORIGINS`. Login and OTP endpoints are rate-limited. Evidence and PDFs are served through
short-lived HMAC-signed links, so session tokens never appear in URLs. State and district users only see
projects, alerts, cameras and evidence in their own area. Audit log entries are hash-chained, and the database blocks
any update or delete on them.
