# Sakshya360 – YouTube demo video script (web app)

**Target length:** about 10 minutes (10:15 at the listed scene timings) · **Format:** screen recording (1920×1080) with voice-over · **Language:** English narration (Hindi captions optional)

Each scene has four parts:
- **SCREEN:** what to click.
- **SAY:** the narration.
- **TEXT:** optional on-screen caption.
- **⏱:** approximate duration.

## Official problem statement

**ID:** 26095  
**Title:** Smart Real-Time Monitoring & Inspection Mobile App  
**Organization:** Ministry of Social Justice and Empowerment (MoSJE)  
**Department:** Department of Social Justice and Empowerment  
**Category:** Software  
**Theme:** Smart Automation

**Description:** Develop a centralized mobile application for real-time monitoring, surprise inspections, CCTV surveillance integration, and random inspection assignment for projects, institutes, and NGOs running under DoSJE schemes.

**Key features:**
- Live CCTV feed integration from projects and institutes
- Random video conferencing with project in-charges, staff, and beneficiaries
- Real-time monitoring dashboard for Department officials
- Mobile inspection module for PMU and inspection teams
- Random inspection duty assignment through AI or automation
- Geo-tagged inspection reports and live evidence capture
- AI-based anomaly and attendance analytics

**Stakeholders:** DoSJE divisions, PMU teams, NGOs and institutes, beneficiaries, and State and District authorities.

**Expected outcomes:** Improved transparency and accountability; reduced fake reporting and proxy functioning; real-time project monitoring; better inspection governance and compliance; and enhanced citizen-centric service delivery.

---

## Before you record (15 minutes of setup)

1. Reset to clean demo data and start everything:
   ```bash
   cd ~/Desktop/Sakshya360
   npm run infra:up && npm run api:reseed
   npm run ml      # terminal 2
   npm run api     # terminal 3
   npm run web     # terminal 4  → http://localhost:5180
   npm run mobile  # terminal 5  (for the two short phone cut-aways)
   ```
2. **Create the inspection reports** so the Reports page is not empty. Choose one:
   - **No phone (quickest):** Web → *Inspection reports* → **🧪 Create demo reports** (or `npm run demo:reports`). This files three realistic reports through the real pipeline:
     - **Lucknow:** on site, compliance 90%.
     - **Bhopal:** headcount 14 vs register 40, captured offline, so it shows *Offline sync*.
     - **Amritsar:** filed **12 km away**, so it shows *Outside geofence*.
     Each report has watermarked site photos, SHA-256 hashes and a PDF.
   - **With a phone (more authentic):**
     - Web → *Inspection assignment* → *Generate surprise inspections* (count 3).
     - Phone → log in as the inspector who got a duty → *Start inspection* → take 2–3 photos → switch on *simulate being on site* → headcount **8**, register **25** → *Submit*.

   Click the button **before** you start recording, so the live alerts for these reports don't appear mid-scene. Or click it on camera during Scene 9 to show the alerts arriving live.
3. On a second phone (or the same phone later), log in as NGO `p101@ngo.sakshya360.in` and keep the **Video calls** tab open for Scene 10.
   **Important:** meet.jit.si only starts a call once a moderator has logged in. The first time you start a random VC, click **Log-in** inside the call panel and sign in with Google or GitHub. After that the call starts as soon as the NGO answers. Do one practice call before recording.
4. Browser:
   - Chrome, zoom 110%, bookmarks bar hidden, a clean profile (no extensions).
   - Open two windows: A = `official@dosje.gov.in`, B = an Incognito window for the state/district logins.
5. Close notifications (Focus mode on). Record the full screen at 30 fps. OBS or QuickTime works.
6. Keep a phone with a QR scanner ready for Scene 11.

> Tip: record each scene as a separate clip and join them in the edit. Pauses and mistakes are then easy to cut.

---

## Scene 1 – Hook (0:00–0:25) ⏱ 25 s

**SCREEN:** Black screen, then a fast montage (2–3 s each): dashboard risk map → live CCTV grid → incoming VC → PDF report → Hindi QR feedback page.

**SAY:**
> "Thousands of shelters, rehab centres and hostels across India run on government funds. But how do you know a centre that claims forty residents actually has forty? That the register isn't copied day after day? That the inspector really visited?
> This is **Sakshya360**, a real-time monitoring and inspection platform for the Department of Social Justice and Empowerment."

**TEXT:** `Sakshya360 · SIH 2025 · Problem Statement 26095 · MoSJE`

---

## Scene 2 – The problem and the solution (0:25–1:00) ⏱ 35 s

**SCREEN:** A title slide with 3 problems → 3 answers (or narrate over the login page).

**SAY:**
> "The problem statement asks for three things: real-time monitoring, surprise inspections that can't be predicted or faked, and AI that spots anomalies and proxy attendance.
> Sakshya360 has a web dashboard for officials and one mobile app for inspectors, NGOs and beneficiaries. It also includes live CCTV, random video calls, AI-assigned inspections, geo-tagged evidence and machine-learning analytics."

**TEXT:** `Live CCTV · Random VC · AI assignment · Geo-tagged evidence · AI analytics`

---

## Scene 3 – Login and roles (1:00–1:25) ⏱ 25 s

**SCREEN:** `http://localhost:5180/login` → point at the three demo accounts → sign in as `official@dosje.gov.in`.

**SAY:**
> "Officials sign in here. In production this uses **Parichay**, the Government of India single sign-on, and the button appears as soon as it's configured.
> There are three levels of access: the **DoSJE Division** sees all of India, a **State authority** sees only its state, and a **District officer** only their district. We'll see that in a moment."

**TEXT:** `Role-based access: Division → State → District`

---

## Scene 4 – Live dashboard (1:25–2:25) ⏱ 60 s

**SCREEN:**
1. Pan slowly over the KPI cards: **8 projects**, **30/32 cameras online**, **3 high-risk projects**, open inspections, overdue, geofence failures, **open grievances**, cameras offline.
2. Hover the **Risk map**: red circles in Bhopal and Amritsar, green elsewhere. Click one popup.
3. Scroll to **Projects by AI risk**: P103 and P108 at **Risk 99**, P106 at **74**.
4. Point at the **Live alerts** panel and the **Latest inspection reports** card.

**SAY:**
> "This is the real-time dashboard, shown here with demo data. At a glance: eight projects, thirty of thirty-two CCTV cameras online, and three projects the AI marks as high risk.
> The map shows every centre coloured by risk. Bhopal and Amritsar are red.
> Below, projects are ranked by AI risk score. The SMILE Shelter in Bhopal and the Drop-in Centre in Amritsar both score 99 out of 100.
> On the right is the live alert feed. Anything that happens in the field (a report, a failed geofence, a rejected attendance, a grievance) appears here instantly, without refreshing."

**TEXT:** `Updates live over WebSockets`

---

## Scene 5 – Why is a centre high-risk? Explainable AI (2:25–3:35) ⏱ 70 s

**SCREEN:** Click **SMILE Shelter Home (P103)**.
1. The KPI row: **P(malpractice) 98%** (Gradient Boosting), **Novelty** (Isolation Forest), **Sequence anomaly 6.0 · too regular** (PyTorch autoencoder).
2. The **Attendance – last 30 days** chart: a perfectly flat line at the sanctioned capacity of 40.
3. **Why this score** (drivers) and **AI findings**: `PROXY_REGISTER`, `AE_TOO_REGULAR`, `CCTV_OFFLINE`, `BENEFICIARY_REPORT`.
4. Scroll: registered people, cameras (two offline), automatic CCTV checks.

**SAY:**
> "Why is Bhopal flagged? Let's open it.
> Three independent models agree. A gradient-boosting classifier puts the probability of malpractice at 98 percent. An isolation forest measures how unusual the centre is. And a neural-network autoencoder scores the attendance pattern at six times the normal limit, **too regular** to be real.
> Look at the chart. Exactly forty residents every single day for a month. Real attendance goes up and down, so this register is copy-pasted.
> The system doesn't just give a score; it explains it. It shows the proxy register, two cameras offline, and a beneficiary who reported fake attendance. An official can act on this, not just trust a black box."

**TEXT:** `3 models · explainable findings · Risk 99/100`

---

## Scene 6 – Live CCTV surveillance and camera health (3:35–4:35) ⏱ 60 s

**SCREEN:**
1. Click **📹 CCTV** (or the sidebar *CCTV surveillance*). The grid of live streams shows **● LIVE** badges; offline cameras are shown first.
2. Point at the header line: **Media server: up · last health check … · 2 of 32 cameras offline**.
3. On a live tile, click **🧠 Count people** → green boxes + "OpenCV detected N person(s) · register today … · expected visible ≈ …".
4. Click **📸 Save evidence** → "Saved to evidence".
5. Click **✂ Cut feed** on one camera. Narrate while waiting ~60 s (cut this wait in the edit), then refresh: the camera shows **🔴 Offline** and a **CCTV_OFFLINE** alert toast appears.
6. Click **↺ Restore**.

**SAY:**
> "CCTV from every centre streams live into the dashboard over WebRTC, with under a second of delay.
> AI counts the people in the current frame and compares that with the register. If the register claims forty residents but the common room is empty, that's flagged.
> Any frame can be saved as tamper-proof evidence.
> Cameras can't be quietly switched off, either. Every camera is health-checked each minute. Watch: I'll cut this feed… and within a minute the system detects it, marks it offline and alerts officials.
> In the background, the system also samples cameras automatically through the day and compares the people it sees with the register."

**TEXT:** `WebRTC live · AI people count · auto health checks`

> Note: the demo cameras loop real CCTV-style footage (entrance, dormitory, kitchen/store, classroom) with a camera label and live IST clock. Use **Count people** on a **Main Gate** or **Kitchen** camera: the detector finds people walking or standing, but misses people sitting down, so it undercounts the Activity Hall.

---

## Scene 7 – Random inspection assignment and automation (4:35–5:40) ⏱ 65 s

**SCREEN:** Sidebar **🎲 Inspection assignment**.
1. The **Automation** panel: *Daily random assignment at 09:00 IST · 3 inspections · weekdays only*, *Automatic CCTV occupancy checks*, the last-run lines. Click **Check overdue now** once.
2. Set Inspections = **3** → **🎲 Generate surprise inspections**.
3. **Solver result** table: project → inspector → reason ("priority … (risk + neglect + random), … km").
4. **Randomised priorities** and **Excluded pairs** (e.g. "P101 ✗ I01: home state").
5. **All assignments**: status pills *assigned / in progress / completed / overdue*, with "auto" under scheduled ones.

**SAY:**
> "Surprise inspections only work if nobody can predict them. Sakshya360 assigns them with an optimisation solver, Google OR-Tools.
> Each centre gets a priority: its AI risk, plus how long since its last inspection, plus a random draw. High-risk centres are visited more often, but no NGO can guess when.
> There are strict rules too. No inspector visits a centre in their home state, which avoids a conflict of interest. Nobody inspects the same centre twice in a row. And nobody is overloaded.
> Every batch is audit-logged with its random seed, so it can be replayed and proven fair.
> And it's fully automatic: every weekday at nine a.m. new surprise inspections are assigned. If an inspector misses the deadline, the duty turns **overdue** and officials are alerted."

**TEXT:** `OR-Tools CP-SAT · conflict-of-interest rules · runs daily`

---

## Scene 8 – The inspector in the field (cut-away, phone) (5:40–6:10) ⏱ 30 s

**SCREEN (phone, screen-mirrored or filmed):** Inspector app → *My duties* → *Start inspection* → map with the green geofence → take a photo (show the **GPS/time stamp** burned into it) → checklist → headcount → *Submit signed report*. Optional: turn on airplane mode → *Saved offline*.

**SAY:**
> "In the field, the inspector's phone must be inside the centre's geofence. Photos come only from the in-app camera, and each one is stamped with GPS, time and inspector name. No gallery uploads. There's no network in a remote area? The report is saved on the phone and sent automatically later, with its original time kept."

**TEXT:** `Geofence · watermarked photos · works offline`

---

## Scene 9 – Geo-tagged reports, evidence and PDF (6:10–7:05) ⏱ 55 s

**SCREEN:** Sidebar **📋 Inspection reports**. Use the Bhopal demo report (headcount mismatch, offline sync), then scroll to Amritsar (**Outside geofence · 12.3 km from registered site**).
1. Pills: **On-site ✓**, **Compliance NN%**, and (if applicable) **Offline sync**.
2. The **geofence map**: the report location dot inside the site circle; "… m from registered site".
3. **Headcount observed 8 · register claims 25 · Mismatch** and the checklist ✅/❌.
4. **Live evidence**: click a photo to show the watermark → **Verify hash** → pill turns **intact**.
5. Click **⬇ PDF** → show the PDF: header, location verification, checklist, photos with SHA-256, signature.

**SAY:**
> "Every report arrives geo-verified. Here in Bhopal the inspector was fifty-four metres from the registered site, inside the fence. There was no mobile network, so the phone saved the report and sent it later, with the original inspection time kept.
> And look at Amritsar: this report was filed twelve kilometres away from the centre. The inspector never went there, and it's flagged in red automatically.
> Back in Bhopal, only fourteen people were physically present while the register claimed forty. That's a proxy-attendance red flag, and officials got an alert the moment it was submitted.
> Every photo is fingerprinted with SHA-256. Click **Verify** and the server re-hashes the stored file: intact. Any edit, even one pixel, would show as tampered. The same photo can never be reused in another report.
> And the whole report exports as an official PDF, signed and ready for the file."

**TEXT:** `PostGIS geofence · SHA-256 evidence · signed PDF`

---

## Scene 10 – Random video verification (7:05–8:00) ⏱ 55 s

**SCREEN:** Sidebar **📞 Random VC** → **🎲 Start random VC**.
1. The Jitsi call opens. The side panel shows the chosen person, "**Ringing on mobile…**" and the timer counting.
2. (Cut-away) The NGO phone shows **Incoming DoSJE verification call** → *Answer now*.
3. Back on web: the pill changes to **Answered in 12s**. Tick the checklist: face matches, premises shown, beneficiaries present, register on camera.
4. Click **✓ Close & record** → the outcome appears in **Call history**.

**SAY:**
> "Officials can also check a centre without travelling. One click, and the server picks a project **and a person** at random: the in-charge, a staff member or a beneficiary.
> Their phone rings immediately, even if the app is closed, and they have sixty seconds to answer and show the premises, the register and the residents, live.
> The official ticks what they verified, and the result is recorded. An unanswered or suspicious call automatically raises the centre's risk score."

**TEXT:** `Random person · 60-second answer window · recorded outcome`

---

## Scene 11 – Beneficiary voice: grievances and QR feedback (8:00–8:50) ⏱ 50 s

**SCREEN:**
1. Open a project (e.g. P101) → **🗣️ Feedback QR poster** → the printable Hindi/English poster with the QR code.
2. Scan it with a phone → the public page opens **in Hindi** (*अपनी राय दें*) → toggle English → pick "Food / meals" → submit → "Thank you… Reference ABC123".
3. Back on web: a **GRIEVANCE** toast appears. Sidebar **🗣️ Beneficiary grievances**: the Hindi complaint from P103 ("रजिस्टर में रोज़ 40 लोग…"), the new QR complaint.
4. Type a reply → **Resolve with reply**.

**SAY:**
> "The people these schemes serve finally have a direct voice. Every centre displays this QR poster. Anyone can scan it and complain anonymously, in Hindi or English, about food, absent staff, money demanded, or fake attendance.
> Registered beneficiaries can also log in on the app with just their mobile number and an OTP, and they see the Department's reply.
> The complaint goes straight to the Department, not the centre. Look at this one from Bhopal: 'the register shows forty people daily, but only fifteen to twenty stay here.' That confirms exactly what the AI found.
> Serious grievances raise an alert and increase the centre's risk score."

**TEXT:** `Anonymous QR · OTP login · Hindi & English`

---

## Scene 12 – AI analytics and tamper-proof audit trail (8:50–9:30) ⏱ 40 s

**SCREEN:** Sidebar **🧠 AI analytics & audit**.
1. **Model card**: Risk classifier ROC-AUC **0.955**, precision/recall, Autoencoder ROC-AUC **0.897**.
2. The **Detection by malpractice pattern** bar chart (flat register, inspection spike, over-report, ghost beneficiaries, round numbers).
3. **Flagged projects** cards.
4. **Audit trail** table → click **Verify chain** → **"N entries intact"**.

**SAY:**
> "Here's the model card. The risk classifier reaches an ROC-AUC of 0.955, and it's tested separately on five known fraud patterns: copy-paste registers, attendance spikes on inspection days, over-reporting, ghost beneficiaries and made-up round numbers. As real inspection outcomes come in, the models retrain on actual data.
> Finally, accountability for the system itself. Every action, from logins and assignments to reports, calls and replies, goes into an append-only, hash-chained audit trail. One click verifies that no record has been altered or deleted."

**TEXT:** `ROC-AUC 0.955 · hash-chained audit log`

---

## Scene 13 – Jurisdiction in action (9:30–9:50) ⏱ 20 s

**SCREEN:** Incognito window → log in as `district.lucknow@dosje.gov.in` → the dashboard shows **1 project** (Lucknow) and the sidebar reads *District authority · Lucknow*. Try the Bhopal project URL (`/projects/P103`) → not found.

**SAY:**
> "And the same dashboard, signed in as the Lucknow district officer: only their district's centre, cameras, alerts and evidence. Nothing else is visible, not even by typing another project's address."

**TEXT:** `Least-privilege access`

---

## Scene 14 – Close (9:50–10:15) ⏱ 25 s

**SCREEN:** Back to the dashboard risk map, slow zoom out → end card with logo, team name and the GitHub/contact link.

**SAY:**
> "Sakshya360. Sakshya means *evidence*. Real-time monitoring, surprise inspections that can't be predicted, evidence that can't be faked, and a voice for every beneficiary.
> Built for the Department of Social Justice and Empowerment, to make sure public money reaches the people it's meant for.
> Thank you for watching."

**TEXT:** `Sakshya360 — Evidence you can trust` · `Team <name> · SIH 2025 · PS 26095`

---

## YouTube upload kit

**Title (pick one)**
- Sakshya360 – AI-Powered Monitoring & Surprise Inspection App for DoSJE | SIH 2025 PS 26095
- How AI Catches Fake Attendance in Government-Funded Shelters | Sakshya360 Demo

**Description**
```
Sakshya360 is a real-time monitoring and inspection platform built for the Department of Social Justice & Empowerment (Ministry of Social Justice & Empowerment) – Smart India Hackathon 2025, Problem Statement 26095.

Features shown:
• Live dashboard with AI risk map and real-time alerts
• Explainable AI: gradient boosting, isolation forest and a PyTorch autoencoder detect proxy registers and ghost beneficiaries
• Live CCTV over WebRTC with AI people counting and automatic camera health checks
• Random, conflict-free inspection assignment (Google OR-Tools), running automatically every day
• Geo-fenced, watermarked, SHA-256-verified inspection evidence with signed PDF reports; works offline
• Random video verification calls that ring the centre's phone
• Beneficiary grievances via anonymous QR code or OTP login, in Hindi and English
• Division / State / District access control and a hash-chained audit trail

CCTV demo footage: Intel IoT DevKit sample videos (CC BY 4.0).

Tech: React, React Native (Expo), Node.js, PostgreSQL + PostGIS, MongoDB GridFS, FastAPI, scikit-learn, PyTorch, OpenCV, OR-Tools, MediaMTX, Jitsi.

Chapters:
0:00 The problem
0:25 Sakshya360 overview
1:00 Login & roles
1:25 Live dashboard
2:25 Explainable AI risk
3:35 Live CCTV & camera health
4:35 AI inspection assignment
5:40 Inspector in the field
6:10 Geo-tagged reports & PDF
7:05 Random video verification
8:00 Beneficiary grievances & QR feedback
8:50 AI analytics & audit trail
9:30 District-level access
9:50 Closing

#SIH2025 #SmartIndiaHackathon #GovTech #AI #DigitalIndia
```

**Tags:** Smart India Hackathon, SIH 2025, DoSJE, MoSJE, social justice, govtech, AI monitoring, fraud detection, CCTV, inspection app, React Native, machine learning, PostGIS

**Thumbnail idea:** the red "Risk 99" project page with the flat attendance line, and big text **"AI CAUGHT A FAKE REGISTER"** plus the Sakshya360 logo and a small tricolour strip.

---

## Recording checklist

- [ ] Fresh data (`npm run api:reseed`), then **🧪 Create demo reports** (or a real inspection from the phone)
- [ ] NGO phone logged in (Scene 10), QR scanner phone ready (Scene 11)
- [ ] Browser zoom 110%, notifications off, cursor highlight on
- [ ] Wait for **● LIVE** on the CCTV tiles before narrating Scene 6
- [ ] Cut the ~60 s wait after *Cut feed*; restore the camera afterwards
- [ ] Say "demo data" once (Scene 4) – the centres and numbers are simulated
