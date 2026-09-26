/* Sakshya360 frontend – talks to the backend REST API (/api/*). */
(function () {
  'use strict';

  // ---------- API ----------
  let session = null;
  try { session = JSON.parse(localStorage.getItem('sakshya360.session')); } catch { /* storage blocked */ }
  const saveSession = s => { session = s; try { s ? localStorage.setItem('sakshya360.session', JSON.stringify(s)) : localStorage.removeItem('sakshya360.session'); } catch { /* ignore */ } };

  async function api(path, body) {
    const res = await fetch('/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(session ? { Authorization: 'Bearer ' + session.token } : {}) },
      body: body && JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { saveSession(null); renderLogin(); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const view = $('#view');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = t => new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), 2800); };
  const loading = () => { view.innerHTML = '<div class="card muted">Loading…</div>'; };
  const fail = e => { view.innerHTML = `<div class="card"><span class="pill red">Error</span> ${esc(e.message)}</div>`; };
  function haversineM(a, b, c, d) {
    const r = x => x * Math.PI / 180;
    const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
    return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
  }

  function openModal(html) { $('#modalBody').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { stopMedia(); $('#modal').classList.add('hidden'); $('#modalBody').innerHTML = ''; if (onModalClose) { const f = onModalClose; onModalClose = null; f(); } }
  let onModalClose = null;
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  let activeStreams = [], activeTimers = [];
  function stopMedia() {
    activeStreams.forEach(s => s.getTracks().forEach(t => t.stop())); activeStreams = [];
    activeTimers.forEach(t => { clearInterval(t); cancelAnimationFrame(t); }); activeTimers = [];
  }
  async function getCamera(facing) {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
    activeStreams.push(s); return s;
  }
  function getPosition() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error('Geolocation unavailable'));
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }), rej, { enableHighAccuracy: true, timeout: 10000 });
    });
  }
  function grabFrame(video, width, stamp) {
    const c = document.createElement('canvas');
    c.width = width; c.height = Math.round(width * video.videoHeight / video.videoWidth);
    const ctx = c.getContext('2d'); ctx.drawImage(video, 0, 0, c.width, c.height);
    if (stamp) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, c.height - 62, c.width, 62);
      ctx.fillStyle = '#fff'; ctx.font = '15px monospace'; stamp.forEach((s, i) => ctx.fillText(s, 10, c.height - 42 + i * 18));
    }
    return c.toDataURL('image/jpeg', 0.7);
  }

  const riskPill = a => `<span class="pill ${a.risk >= 60 ? 'red' : a.risk >= 30 ? 'amber' : 'green'}">Risk ${a.risk}</span>`;
  const flagList = flags => flags.length
    ? flags.map(f => `<div style="margin-top:6px"><span class="pill ${f.sev === 'high' ? 'red' : 'amber'}">${f.code}</span> <span style="font-size:13px">${esc(f.text)}</span></div>`).join('')
    : '<span class="muted">No anomalies detected</span>';
  function sparkline(arr, cap) {
    const max = Math.max(cap, ...arr) * 1.05, w = 300, h = 60;
    const pts = arr.map((v, i) => `${(i / (arr.length - 1)) * w},${h - (v / max) * h}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:60px"><line x1="0" x2="${w}" y1="${h - cap / max * h}" y2="${h - cap / max * h}" stroke="#d93025" stroke-dasharray="4"/><polyline points="${pts}" fill="none" stroke="#0b1d3a" stroke-width="2"/></svg>`;
  }

  // ---------- simulated CCTV renderer ----------
  // Production: RTSP/ONVIF → media gateway → WebRTC/HLS, with a YOLO detector producing person counts.
  function startCctv(canvas, cam, big) {
    const ctx = canvas.getContext('2d');
    canvas.width = big ? 640 : 320; canvas.height = big ? 480 : 240;
    const W = canvas.width, H = canvas.height;
    let seed = [...cam.id].reduce((s, c) => s + c.charCodeAt(0), 0);
    const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const n = cam.label === 'Dormitory' ? 3 + Math.floor(r() * 5) : 1 + Math.floor(r() * 6);
    const people = Array.from({ length: n }, () => ({ x: r() * W, y: H * 0.45 + r() * H * 0.5, vx: (r() - 0.5) * 1.2, vy: (r() - 0.5) * 0.5 }));
    const tint = { 'Main Gate': '#3a4a3a', Dormitory: '#3b3b4d', Kitchen: '#4d443b', 'Activity Hall': '#3b4a4d' }[cam.label] || '#333';
    function draw() {
      if (!cam.online) {
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
        ctx.fillStyle = '#f44'; ctx.font = `bold ${W / 16}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('NO SIGNAL', W / 2, H / 2); ctx.textAlign = 'left';
      } else {
        ctx.fillStyle = tint; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fillRect(0, 0, W, H * 0.4);
        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(W / 2, H * 0.4); ctx.lineTo(i * W / 5, H); ctx.stroke(); }
        people.forEach(pp => {
          pp.x += pp.vx; pp.y += pp.vy;
          if (pp.x < 10 || pp.x > W - 10) pp.vx *= -1;
          if (pp.y < H * 0.45 || pp.y > H - 10) pp.vy *= -1;
          const s = (pp.y / H) * (W / 16);
          ctx.fillStyle = '#d9c7b0'; ctx.beginPath(); ctx.arc(pp.x, pp.y - s * 1.6, s * 0.35, 0, 7); ctx.fill();
          ctx.fillStyle = '#6d7fa0'; ctx.fillRect(pp.x - s * 0.4, pp.y - s * 1.2, s * 0.8, s * 1.2);
          if (big) { ctx.strokeStyle = '#0f0'; ctx.strokeRect(pp.x - s * 0.6, pp.y - s * 2.1, s * 1.2, s * 2.2); }
        });
        if (big) { ctx.fillStyle = '#0f0'; ctx.font = '14px monospace'; ctx.fillText(`Persons detected: ${people.length}`, 10, 22); }
      }
      ctx.fillStyle = '#fff'; ctx.font = `${big ? 13 : 9}px monospace`;
      ctx.fillText(new Date().toLocaleString('en-IN'), W - (big ? 190 : 120), H - 8);
      activeTimers.push(requestAnimationFrame(draw));
    }
    draw();
    return people.length;
  }

  // ---------- shell ----------
  const ROLES = {
    official: { label: 'DoSJE Division Official', icon: '🏛️', sub: 'Monitoring cell, Shastri Bhawan', tabs: [['home', '📊', 'Dashboard'], ['cctv', '📹', 'CCTV'], ['vc', '📞', 'Random VC'], ['assign', '🎲', 'Assign'], ['analytics', '🧠', 'AI Alerts'], ['reports', '📋', 'Reports']] },
    inspector: { label: 'PMU / Inspection Team', icon: '🕵️', sub: 'Arjun Mehta · PMU Delhi', tabs: [['duties', '🗂️', 'My Duties'], ['reports', '📋', 'My Reports']] },
    ngo: { label: 'NGO / Institute Incharge', icon: '🏠', sub: 'Navjeevan Seva Samiti · Lucknow', tabs: [['checkin', '✅', 'Attendance'], ['ngovc', '📞', 'VC Inbox']] },
  };
  let currentTab = null, me = null;

  function renderLogin() {
    stopMedia();
    $('#tabs').classList.add('hidden'); $('#logoutBtn').classList.add('hidden'); $('#roleLabel').textContent = 'DoSJE Monitoring';
    view.innerHTML = `
      <div class="hero"><h2 style="margin:0">Sakshya360</h2>
        <p>Real-time monitoring, surprise inspection & CCTV surveillance for projects under DoSJE schemes.</p><div class="tricolor"></div></div>
      <h3>Sign in as (demo)</h3>
      <div class="stack">${Object.entries(ROLES).map(([k, r]) => `
        <button class="card btn outline login-role" data-role="${k}" style="width:100%"><span>${r.icon}</span><div><b>${r.label}</b><div class="muted">${r.sub}</div></div></button>`).join('')}
      </div>
      <div class="card muted" id="health" style="margin-top:16px">Checking services…</div>`;
    view.querySelectorAll('[data-role]').forEach(b => b.onclick = async () => {
      try { saveSession(await api('/login', { role: b.dataset.role })); boot(); } catch (e) { toast(e.message); }
    });
    api('/health').then(h => {
      $('#health') && ($('#health').innerHTML = `API <span class="pill green">online</span> · ML model ${h.ml.ok ? `<span class="pill green">online</span> ROC-AUC ${h.ml.roc_auc}` : '<span class="pill amber">offline – rule fallback</span>'}`);
    }).catch(() => { $('#health') && ($('#health').innerHTML = 'API <span class="pill red">offline</span> – start the backend'); });
  }

  async function boot() {
    stopMedia();
    if (!session) return renderLogin();
    try { me = await api('/me'); } catch { return; }
    const r = ROLES[session.role];
    $('#roleLabel').textContent = r.label; $('#logoutBtn').classList.remove('hidden');
    const tabs = $('#tabs'); tabs.classList.remove('hidden');
    tabs.innerHTML = r.tabs.map(([k, ic, l]) => `<button data-tab="${k}"><span>${ic}</span>${l}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => go(b.dataset.tab));
    go(r.tabs[0][0]);
  }
  $('#logoutBtn').onclick = () => { saveSession(null); renderLogin(); };

  function go(tab, arg) {
    stopMedia(); currentTab = tab;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    window.scrollTo(0, 0);
    loading();
    const views = { home: vHome, cctv: vCctv, vc: vVc, assign: vAssign, analytics: vAnalytics, reports: vReports, duties: vDuties, checkin: vCheckin, ngovc: vNgoVc };
    Promise.resolve(views[tab](arg)).catch(fail);
  }

  // ---------- Official: dashboard ----------
  async function vHome() {
    const [k, list] = await Promise.all([api('/dashboard'), api('/projects')]);
    list.sort((x, y) => y.analysis.risk - x.analysis.risk);
    const minLat = 8, maxLat = 34, minLng = 68, maxLng = 92;
    const xy = p => [((p.lng - minLng) / (maxLng - minLng)) * 100, (1 - (p.lat - minLat) / (maxLat - minLat)) * 100];
    view.innerHTML = `
      <h2>Live Monitoring Dashboard</h2>
      <div class="grid2">
        <div class="kpi"><b>${k.projects}</b><small>Projects monitored</small></div>
        <div class="kpi"><b style="color:${k.camerasOnline < k.camerasTotal ? 'var(--amber)' : 'var(--ok)'}">${k.camerasOnline}/${k.camerasTotal}</b><small>CCTV cameras live</small></div>
        <div class="kpi"><b style="color:var(--red)">${k.highAlerts}</b><small>High-severity AI alerts</small></div>
        <div class="kpi"><b>${k.openAssignments}</b><small>Surprise inspections open</small></div>
      </div>
      <p class="muted">Risk engine: ${k.mlSource === 'ml' ? '🧠 ML model (Gradient Boosting + Isolation Forest)' : '⚠ rule fallback (ML service offline)'}</p>
      <h3>Project risk map</h3>
      <div id="map" class="card" style="padding:0"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M30 2 L45 4 L52 14 L62 22 L80 28 L96 30 L92 42 L78 46 L70 58 L58 70 L50 88 L44 98 L38 86 L30 64 L22 52 L6 46 L10 34 L22 26 L26 12 Z" fill="#dbe4f0" stroke="#9fb1cc" stroke-width=".5"/>
        ${list.map(p => { const [x, y] = xy(p), r = p.analysis.risk; return `<circle data-pid="${p.id}" style="cursor:pointer" cx="${x}" cy="${y}" r="${2 + r / 25}" fill="${r >= 60 ? '#d93025' : r >= 30 ? '#e8a200' : '#188038'}" opacity=".85"/>`; }).join('')}
      </svg></div>
      <h3>Projects by risk</h3>
      <div class="card">${list.map(p => `
        <div class="list-item" data-pid="${p.id}" style="cursor:pointer">
          <div class="row"><b>${esc(p.name)}</b>${riskPill(p.analysis)}</div>
          <div class="muted">${p.scheme} · ${esc(p.ngo)} · ${p.district}, ${p.state}</div>
          <div class="row" style="margin-top:6px"><div class="bar" style="flex:1"><i class="${p.analysis.occupancy > 100 ? 'bad' : p.analysis.occupancy < 60 ? 'warn' : ''}" style="width:${Math.min(100, p.analysis.occupancy)}%"></i></div><small class="muted">${p.analysis.avg}/${p.sanctioned} avg present</small></div>
        </div>`).join('')}</div>`;
    view.querySelectorAll('[data-pid]').forEach(el => el.onclick = () => projectSheet(el.dataset.pid));
  }

  async function projectSheet(id) {
    let p;
    try { p = await api('/projects/' + id); } catch (e) { return toast(e.message); }
    const a = p.analysis;
    openModal(`
      <div class="row"><h2>${esc(p.name)}</h2><button class="btn outline" style="width:auto" id="x">✕</button></div>
      <div class="muted">${p.id} · ${p.scheme} · ${esc(p.ngo)}<br>${p.district}, ${p.state} · Incharge: ${esc(p.incharge)}</div>
      <div class="card" style="margin-top:12px"><div class="row"><b>30-day attendance</b>${riskPill(a)}</div>${sparkline(p.attendance, p.sanctioned)}<div class="muted">Red dashed line = sanctioned capacity (${p.sanctioned})</div></div>
      <div class="grid2"><div class="kpi"><b>${a.probability != null ? Math.round(a.probability * 100) + '%' : '—'}</b><small>ML malpractice probability</small></div><div class="kpi"><b>${a.novelty != null ? Math.round(a.novelty * 100) + '%' : '—'}</b><small>Novelty (Isolation Forest)</small></div>
        <div class="kpi"><b>${p.fundUtilisation}%</b><small>Fund utilisation</small></div><div class="kpi"><b>${p.complaints}</b><small>Grievances</small></div></div>
      <h3>Why this score</h3>
      <div class="card">${a.drivers.length ? a.drivers.map(d => `<div class="row list-item"><span>${d.feature}</span><small class="muted">value ${d.value}</small></div>`).join('') : '<span class="muted">No dominant drivers</span>'}</div>
      <h3>AI findings</h3><div class="card">${flagList(a.flags)}</div>
      <div class="grid2"><button class="btn" id="sCctv">📹 View CCTV</button><button class="btn saffron" id="sVc">📞 Random VC</button></div>`);
    $('#x').onclick = closeModal;
    $('#sCctv').onclick = () => { closeModal(); go('cctv', id); };
    $('#sVc').onclick = () => { closeModal(); startVc(id); };
  }

  // ---------- Official: CCTV ----------
  async function vCctv(selected) {
    const list = await api('/projects');
    view.innerHTML = `
      <h2>CCTV Surveillance</h2>
      <select id="camProject">${list.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.id} · ${esc(p.name)} (${p.district})</option>`).join('')}</select>
      <div id="wall" class="cctv-grid" style="margin-top:12px"></div>
      <p class="muted">Tap a feed to enlarge with AI person counting. Feeds are simulated; production streams RTSP/ONVIF cameras via a media gateway.</p>`;
    const render = () => {
      stopMedia();
      const p = list.find(x => x.id === $('#camProject').value), wall = $('#wall');
      wall.innerHTML = p.cameras.map((c, i) => `<div class="cctv" data-i="${i}"><canvas></canvas><span class="live ${c.online ? '' : 'off'}">${c.online ? '● LIVE' : 'OFFLINE'}</span><span class="lbl">${c.id} · ${c.label}</span></div>`).join('');
      wall.querySelectorAll('.cctv').forEach(el => {
        const cam = p.cameras[el.dataset.i];
        startCctv(el.querySelector('canvas'), cam, false);
        el.onclick = async () => {
          stopMedia();
          onModalClose = render;
          openModal(`<div class="row"><h2>${cam.label}</h2><button class="btn outline" style="width:auto" id="x">✕</button></div><div class="muted">${esc(p.name)} · ${cam.id}</div>
            <div class="cctv big" style="margin-top:10px"><canvas id="bigcam"></canvas><span class="live ${cam.online ? '' : 'off'}">${cam.online ? '● LIVE' : 'OFFLINE'}</span></div>
            <div class="card" id="camInfo" style="margin-top:10px">Analysing…</div>
            <button class="btn saffron" id="snapCam">📸 Save evidence frame</button>`);
          $('#x').onclick = closeModal;
          const count = startCctv($('#bigcam'), cam, true);
          $('#snapCam').onclick = async () => {
            try { const r = await api('/cctv/snapshot', { cameraId: cam.id, frame: $('#bigcam').toDataURL('image/jpeg', 0.7) }); toast('Saved · sha256 ' + r.hash.slice(0, 12)); } catch (e) { toast(e.message); }
          };
          if (!cam.online) { $('#camInfo').innerHTML = '<span class="pill red">Camera offline</span> Downtime is logged and fed to the risk model.'; return; }
          try {
            const h = await api('/cctv/headcount', { projectId: p.id, detected: count });
            $('#camInfo').innerHTML = `<b>AI cross-check</b><div class="muted">Persons detected: ${count} · Register today: ${h.register} · Expected visible ≈ ${h.expected_visible}</div>
              ${h.suspicious ? '<span class="pill red">Register far exceeds visible occupancy</span>' : '<span class="pill green">Consistent with register</span>'}`;
          } catch (e) { $('#camInfo').textContent = e.message; }
        };
      });
    };
    $('#camProject').onchange = render;
    render();
  }

  // ---------- Official: random VC ----------
  async function vVc() {
    const calls = await api('/vc');
    view.innerHTML = `
      <h2>Random Video Verification</h2>
      <div class="card"><p class="muted" style="margin-top:0">The server picks a project and a person (Incharge / Staff / Beneficiary) at random. They must answer within 60 seconds and show the premises live.</p>
        <button class="btn saffron" id="rand">🎲 Start random VC now</button></div>
      <h3>Recent calls</h3>${callList(calls, true)}`;
    $('#rand').onclick = () => startVc();
  }
  const callList = (calls, showProject) => `<div class="card">${calls.map(v => `<div class="list-item"><div class="row"><b>${esc(showProject ? v.projectName : v.person)}</b><span class="pill ${v.outcome === 'Verified' ? 'green' : 'red'}">${v.outcome}</span></div><div class="muted">${showProject ? esc(v.person) + ' · ' : ''}${fmt(v.ts)} · ${v.duration}s</div></div>`).join('') || '<span class="muted">No calls yet</span>'}</div>`;

  async function startVc(projectId) {
    let call;
    try { call = await api('/vc', projectId ? { projectId } : {}); } catch (e) { return toast(e.message); }
    const t0 = Date.now();
    openModal(`
      <h2>📞 Calling…</h2><div class="muted">${esc(call.project.name)} · ${call.project.district}<br>Randomly selected: <b>${esc(call.person.name)}</b> (${call.person.role})</div>
      <div class="vc" style="margin-top:10px"><canvas id="remote" style="width:100%;border-radius:10px;background:#000"></canvas><video id="local" class="pip" autoplay playsinline muted></video></div>
      <div class="row" style="margin:8px 0"><span id="vcStatus" class="pill amber">Ringing</span><b id="vcTimer">00:00</b></div>
      <div class="card"><b>Verification checklist</b>
        <label class="chk"><input type="checkbox" class="vck"> Face matches registered ID</label>
        <label class="chk"><input type="checkbox" class="vck"> Premises / signboard shown live</label>
        <label class="chk"><input type="checkbox" class="vck"> Beneficiaries physically present</label>
        <label class="chk"><input type="checkbox" class="vck"> Answered within 60 seconds</label></div>
      <div class="grid2"><button class="btn green" id="vcOk">✓ Verified</button><button class="btn red" id="vcBad">✗ Flag</button></div>`);
    getCamera('user').then(s => { if ($('#local')) $('#local').srcObject = s; }).catch(() => {});
    const cv = $('#remote'); cv.width = 480; cv.height = 360;
    const connect = setTimeout(() => { if (!$('#remote')) return; $('#vcStatus').textContent = 'Connected'; $('#vcStatus').className = 'pill green'; startCctv(cv, { id: call.id, label: 'Activity Hall', online: true }, false); }, 1800);
    activeTimers.push(connect);
    activeTimers.push(setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000), el = $('#vcTimer'); if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 500));
    const finish = async verified => {
      const checks = document.querySelectorAll('.vck:checked').length;
      try {
        const r = await api(`/vc/${call.id}/finish`, { verified, checks });
        closeModal(); toast('VC logged: ' + r.outcome);
        if (currentTab === 'vc' || currentTab === 'ngovc') go(currentTab);
      } catch (e) { toast(e.message); }
    };
    $('#vcOk').onclick = () => finish(true);
    $('#vcBad').onclick = () => finish(false);
  }

  // ---------- Official: assignment ----------
  async function vAssign(lotteryLog) {
    const list = await api('/assignments');
    view.innerHTML = `
      <h2>Random Inspection Assignment</h2>
      <div class="card stack">
        <div class="muted">Projects are drawn by a risk-weighted lottery (ML risk + days since last inspection). Inspectors are drawn from those without conflict of interest (home state, prior visit, workload), weighted by proximity and free capacity. Runs on the server with a cryptographic RNG; seeds are audit-logged.</div>
        <div class="row"><span>Inspections to schedule</span><input type="number" id="cnt" value="3" min="1" max="8" style="width:80px"></div>
        <button class="btn saffron" id="run">🎲 Run AI lottery</button>
      </div>
      ${lotteryLog ? `<h3>Lottery log</h3><div class="log">${esc(lotteryLog)}</div>` : ''}
      <h3>Assignments</h3>
      <div class="card">${list.map(a => `<div class="list-item"><div class="row"><b>${esc(a.project.name)}</b><span class="pill ${a.status === 'Completed' ? 'green' : 'amber'}">${a.status}</span></div><div class="muted">${esc(a.inspectorName)} · ${a.distanceKm} km · due ${fmt(a.due)} · 🔒 surprise</div></div>`).join('') || '<span class="muted">None</span>'}</div>`;
    $('#run').onclick = async () => {
      $('#run').disabled = true;
      try { const r = await api('/assignments/lottery', { count: +$('#cnt').value }); toast(`${r.created} inspection(s) assigned`); go('assign', r.log); }
      catch (e) { toast(e.message); $('#run').disabled = false; }
    };
  }

  // ---------- Official: analytics ----------
  async function vAnalytics() {
    const [{ projects, model }, auditRows] = await Promise.all([api('/analytics'), api('/audit')]);
    const flagged = projects.filter(p => p.analysis.flags.length || p.analysis.risk >= 30).sort((x, y) => y.analysis.risk - x.analysis.risk);
    const byCode = {};
    flagged.forEach(p => p.analysis.flags.forEach(f => byCode[f.code] = (byCode[f.code] || 0) + 1));
    const mal = model && model.report.malpractice;
    view.innerHTML = `
      <h2>AI Anomaly & Attendance Analytics</h2>
      ${model ? `<div class="card"><b>Model card</b>
        <div class="grid2" style="margin-top:8px">
          <div class="kpi"><b>${model.roc_auc}</b><small>ROC-AUC</small></div>
          <div class="kpi"><b>${mal['f1-score'].toFixed(2)}</b><small>F1 (malpractice)</small></div>
          <div class="kpi"><b>${mal.precision.toFixed(2)}</b><small>Precision</small></div>
          <div class="kpi"><b>${mal.recall.toFixed(2)}</b><small>Recall</small></div></div>
        <div class="muted" style="margin-top:8px">Gradient Boosting + Isolation Forest, ${model.samples} synthetic centres. Top features: ${Object.keys(model.feature_importance).slice(0, 4).join(', ')}</div></div>`
        : '<div class="card"><span class="pill amber">ML offline</span> Showing rule-based fallback.</div>'}
      <div class="card">${Object.entries(byCode).map(([c, n]) => `<div class="row list-item"><span class="pill">${c}</span><b>${n}</b></div>`).join('') || '<span class="muted">No flags</span>'}</div>
      ${flagged.map(p => `<div class="card"><div class="row"><b>${esc(p.name)}</b>${riskPill(p.analysis)}</div><div class="muted">${p.district} · ${p.scheme}${p.analysis.probability != null ? ` · P(malpractice) ${Math.round(p.analysis.probability * 100)}%` : ''}</div>${sparkline(p.attendance, p.sanctioned)}
        ${flagList(p.analysis.flags)}
        <button class="btn outline" style="margin-top:10px" data-pid="${p.id}">Open project</button></div>`).join('')}
      <h3>Audit trail (hash-chained)</h3>
      <div class="log">${auditRows.slice(0, 15).map(e => `${fmt(e.ts)} ${e.action} ${esc(e.detail)}\n  #${e.hash.slice(0, 24)}…`).join('\n') || 'empty'}</div>
      <button class="btn outline" id="verify" style="margin-top:8px">Verify audit chain integrity</button>`;
    view.querySelectorAll('[data-pid]').forEach(b => b.onclick = () => projectSheet(b.dataset.pid));
    $('#verify').onclick = async () => {
      const r = await api('/audit/verify');
      toast(r.ok ? `✓ ${r.checked} audit entries intact` : `⚠ Chain broken at entry #${r.brokenAt}`);
    };
  }

  // ---------- Reports ----------
  async function vReports() {
    const list = await api('/reports');
    view.innerHTML = `<h2>Geo-tagged Inspection Reports</h2>
      ${list.map(r => `<div class="card">
        <div class="row"><b>${esc(r.projectName)}</b><span class="pill ${r.geoOk ? 'green' : 'red'}">${r.geoOk ? 'On-site ✓' : 'Geo mismatch'}</span></div>
        <div class="muted">${esc(r.inspectorName)} · ${fmt(r.ts)}<br>📍 ${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} (${r.distanceM > 5000 ? (r.distanceM / 1000).toFixed(1) + ' km' : r.distanceM + ' m'} from site)${r.simulated ? ' · <b>demo location</b>' : ''}</div>
        <div class="row" style="margin:8px 0"><span>Compliance score</span><b>${r.score}%</b></div>
        <div class="bar"><i class="${r.score < 50 ? 'bad' : r.score < 75 ? 'warn' : ''}" style="width:${r.score}%"></i></div>
        <div class="grid2" style="margin-top:8px">${r.photos.map(ph => `<img class="snap" src="${ph.url}" alt="evidence">`).join('')}</div>
        <div class="muted" style="margin-top:6px">Headcount observed: ${r.headcount} · Register claims: ${r.registerCount}${r.headcount < r.registerCount * 0.7 ? ' <span class="pill red">Mismatch</span>' : ''}</div>
        ${r.remarks ? `<p>${esc(r.remarks)}</p>` : ''}
        <div class="hash">signature ${r.signature}</div>
        ${r.photos.map(ph => `<div class="hash">photo sha256 ${ph.hash}</div>`).join('')}
      </div>`).join('') || '<div class="card muted">No reports submitted yet.</div>'}`;
  }

  // ---------- Inspector: duties ----------
  async function vDuties() {
    const list = (await api('/assignments')).filter(a => a.status !== 'Completed');
    const p = me.profile;
    view.innerHTML = `
      <div class="hero"><b>${esc(p.name)}</b><p>${esc(p.team)} · ${list.length} surprise inspection(s) pending</p><div class="tricolor"></div></div>
      ${list.map(a => `<div class="card">
        <div class="row"><b>${esc(a.project.name)}</b><span class="pill amber">Due ${new Date(a.due).toLocaleDateString('en-IN')}</span></div>
        <div class="muted">${a.project.scheme} · ${esc(a.project.ngo)}<br>${a.project.district}, ${a.project.state} · ${a.distanceKm} km</div>
        <div class="grid2" style="margin-top:10px"><a class="btn outline" style="text-align:center;text-decoration:none" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${a.project.lat},${a.project.lng}">🧭 Navigate</a><button class="btn green" data-aid="${a.id}">Start inspection</button></div>
      </div>`).join('') || `<div class="card"><p class="muted">No pending duties. Assignments are randomised by the Division – you cannot pick sites.</p>
        <button class="btn outline" id="req">Demo: request an assignment</button></div>`}`;
    view.querySelectorAll('[data-aid]').forEach(b => b.onclick = () => inspect(list.find(a => a.id === b.dataset.aid)));
    const req = $('#req');
    if (req) req.onclick = async () => { try { await api('/assignments/request', {}); go('duties'); } catch (e) { toast(e.message); } };
  }

  const CHECKLIST = ['Signboard with scheme name displayed', 'Beneficiary register maintained & signed', 'Biometric/face attendance device working', 'Hygiene of kitchen & toilets', 'Food served as per menu', 'Staff present as per sanctioned posts', 'Grievance box / helpline displayed', 'CCTV cameras functional', 'Fire safety & first-aid available', 'Records of fund utilisation available'];

  async function inspect(a) {
    const site = a.project, photos = [];
    let loc = null;
    openModal(`
      <div class="row"><h2>Inspection</h2><button class="btn outline" style="width:auto" id="x">✕</button></div>
      <div class="muted">${esc(site.name)} · ${site.district}</div>
      <h3>1. Location lock</h3>
      <div class="card"><div id="geo" class="muted">Acquiring GPS…</div>
        <label class="chk"><input type="checkbox" id="simLoc"> Demo only: simulate being at the site (flagged in report)</label></div>
      <h3>2. Live evidence (camera only – no gallery uploads)</h3>
      <div class="card"><video id="cam" autoplay playsinline muted></video>
        <button class="btn saffron" id="shoot" style="margin-top:8px">📸 Capture geo-tagged photo</button>
        <div id="shots" class="grid2" style="margin-top:8px"></div></div>
      <h3>3. Checklist</h3>
      <div class="card">${CHECKLIST.map(c => `<label class="chk"><input type="checkbox" class="ck"> ${c}</label>`).join('')}</div>
      <h3>4. Headcount</h3>
      <div class="card grid2"><div><small class="muted">Physically present</small><input type="number" id="hc" min="0"></div><div><small class="muted">Register claims today</small><input type="number" id="rc" value="${site.register}"></div></div>
      <textarea id="rem" rows="3" placeholder="Remarks / observations"></textarea>
      <button class="btn green" id="submit" style="margin-top:10px">Submit signed report</button>`);
    $('#x').onclick = closeModal;

    const updateGeo = async () => {
      if ($('#simLoc').checked) loc = { lat: site.lat + 0.0003, lng: site.lng + 0.0002, accuracy: 10, simulated: true };
      else {
        try { loc = await getPosition(); } catch (e) { loc = null; $('#geo').innerHTML = `<span class="pill red">GPS unavailable</span> ${esc(e.message)}`; return; }
      }
      const d = haversineM(loc.lat, loc.lng, site.lat, site.lng);
      $('#geo').innerHTML = `📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (±${Math.round(loc.accuracy)} m)<br>Distance from site: <b>${d > 5000 ? (d / 1000).toFixed(1) + ' km' : d + ' m'}</b> ${d <= 250 ? '<span class="pill green">Within 250 m geofence</span>' : '<span class="pill red">Outside geofence</span>'}`;
    };
    $('#simLoc').onchange = updateGeo;
    updateGeo();

    getCamera('environment').then(s => { if ($('#cam')) $('#cam').srcObject = s; })
      .catch(() => { const c = $('#cam'); if (c) c.replaceWith(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'Camera not available – allow camera permission (localhost/HTTPS required).' })); });

    $('#shoot').onclick = () => {
      const v = $('#cam');
      if (!v || !v.videoWidth) return toast('Camera not ready');
      if (!loc) return toast('Waiting for location lock');
      const data = grabFrame(v, 640, [`${site.id} ${site.name}`, `${loc.lat.toFixed(6)}, ${loc.lng.toFixed(6)} ±${Math.round(loc.accuracy)}m`, `${new Date().toLocaleString('en-IN')} · ${me.profile.name}`]);
      photos.push(data);
      $('#shots').insertAdjacentHTML('beforeend', `<img class="snap" src="${data}" alt="evidence">`);
    };

    $('#submit').onclick = async () => {
      if (!loc) return toast('Location required');
      if (!photos.length) return toast('Capture at least one live photo');
      if ($('#hc').value === '') return toast('Enter physical headcount');
      $('#submit').disabled = true;
      try {
        await api('/reports', {
          assignmentId: a.id, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, simulated: !!loc.simulated,
          checklist: [...document.querySelectorAll('.ck')].map(c => c.checked),
          headcount: parseInt($('#hc').value, 10), registerCount: parseInt($('#rc').value, 10), remarks: $('#rem').value.trim(), photos,
        });
        closeModal(); toast('Report submitted & signed'); go('reports');
      } catch (e) { toast(e.message); $('#submit').disabled = false; }
    };
  }

  // ---------- NGO ----------
  async function vCheckin() {
    const p = me.profile, today = await api('/checkins');
    view.innerHTML = `
      <div class="hero"><b>${esc(p.name)}</b><p>${esc(p.ngo)} · ${p.district}</p><div class="tricolor"></div></div>
      <h2>Daily Attendance</h2>
      <div class="card stack">
        <div class="muted">Attendance is accepted only with a live selfie captured inside the project geofence (250 m).</div>
        <select id="who">${p.staff.map(s => `<option value="${esc(s.name)}">${esc(s.name)} – ${s.role}</option>`).join('')}</select>
        <video id="cam" autoplay playsinline muted></video>
        <label class="chk"><input type="checkbox" id="simLoc"> Demo only: simulate being at the site</label>
        <button class="btn green" id="mark">Mark present (selfie + GPS)</button>
      </div>
      <h3>Today (${today.length})</h3>
      <div class="card">${today.map(c => `<div class="list-item row"><div><b>${esc(c.who)}</b><div class="muted">${fmt(c.ts)} · ${c.distanceM > 5000 ? (c.distanceM / 1000).toFixed(1) + ' km' : c.distanceM + ' m'}</div></div><span class="pill ${c.ok ? 'green' : 'red'}">${c.ok ? 'Valid' : 'Rejected'}</span></div>`).join('') || '<span class="muted">No check-ins yet</span>'}</div>`;
    getCamera('user').then(s => { if ($('#cam')) $('#cam').srcObject = s; })
      .catch(() => { const c = $('#cam'); if (c) c.replaceWith(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'Camera permission needed' })); });
    $('#mark').onclick = async () => {
      const v = $('#cam');
      if (!v || !v.videoWidth) return toast('Camera not ready');
      let loc;
      if ($('#simLoc').checked) loc = { lat: p.lat + 0.0002, lng: p.lng };
      else { try { loc = await getPosition(); } catch { return toast('GPS required'); } }
      try {
        const r = await api('/checkins', { who: $('#who').value, lat: loc.lat, lng: loc.lng, simulated: $('#simLoc').checked, selfie: grabFrame(v, 240) });
        toast(r.ok ? 'Attendance recorded' : 'Rejected: outside project geofence');
        go('checkin');
      } catch (e) { toast(e.message); }
    };
  }

  async function vNgoVc() {
    const calls = await api('/vc');
    view.innerHTML = `
      <h2>VC Inbox</h2>
      <div class="card"><p class="muted" style="margin-top:0">Department officials may call at any time without notice. You must answer within 60 seconds and show the premises and beneficiaries live.</p>
        <button class="btn saffron" id="sim">Demo: receive an incoming random VC</button></div>
      <h3>Call history</h3>${callList(calls, false)}`;
    $('#sim').onclick = () => startVc();
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
