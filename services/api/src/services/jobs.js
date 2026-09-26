// In-process scheduler for the automation jobs. Each job takes a PostgreSQL advisory lock, so running
// several API instances never double-assigns or double-alerts.
const { pool, query } = require('../db/pg');
const config = require('../config');
const settings = require('./settings');
const assignment = require('./assignment');
const cameraHealth = require('./cameraHealth');
const cctvWatch = require('./cctvWatch');

const LOCK = { autoAssign: 26095001, overdue: 26095002, cameraHealth: 26095003, cctvWatch: 26095004 };
const state = {};

// Wall-clock parts in the configured region (Asia/Kolkata by default), independent of server TZ.
function localParts(date = new Date(), timeZone = config.timezone) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute, weekday: p.weekday };
}

// True when today's scheduled slot has passed and the job has not yet run in that slot.
function autoAssignDue(cfg, lastRunIso, now = new Date()) {
  if (!cfg.enabled) return false;
  const t = localParts(now);
  if (cfg.weekdaysOnly && ['Sat', 'Sun'].includes(t.weekday)) return false;
  if (t.hour * 60 + t.minute < cfg.hour * 60 + cfg.minute) return false;
  return !lastRunIso || localParts(new Date(lastRunIso)).date !== t.date;
}

async function withLock(name, fn) {
  const client = await pool.connect();
  try {
    const got = (await client.query('SELECT pg_try_advisory_lock($1) ok', [LOCK[name]])).rows[0].ok;
    if (!got) return { skipped: 'locked' };
    try { return await fn(); } finally { await client.query('SELECT pg_advisory_unlock($1)', [LOCK[name]]); }
  } finally {
    client.release();
  }
}

async function record(name, detail) {
  await query(`INSERT INTO job_runs (name, last_run, detail) VALUES ($1, now(), $2)
               ON CONFLICT (name) DO UPDATE SET last_run = now(), detail = EXCLUDED.detail`, [name, detail]);
  state[name] = { at: new Date().toISOString(), detail };
}

const JOBS = {
  async overdue() {
    const n = await assignment.markOverdue();
    await record('overdue', { marked: n });
  },
  async autoAssign() {
    const { autoAssign: cfg } = await settings.get('automation');
    const last = (await query(`SELECT last_run FROM job_runs WHERE name = 'autoAssign'`)).rows[0];
    if (!autoAssignDue(cfg, last && last.last_run)) return;
    let detail;
    try {
      const r = await assignment.createBatch(assignment.SYSTEM, { count: cfg.count, dueInDays: cfg.dueInDays, trigger: 'scheduled' });
      detail = { batchId: r.batchId, created: r.created, seed: r.seed };
    } catch (e) {
      detail = { error: e.message };
    }
    await record('autoAssign', detail);
  },
  async cameraHealth() {
    await record('cameraHealth', await cameraHealth.check());
  },
  async cctvWatch(force) {
    const { cctvWatch: cfg } = await settings.get('automation');
    const h = localParts().hour;
    if (!force && (!cfg.enabled || h < cfg.fromHour || h >= cfg.toHour || cameraHealth.status.mediaServer === 'down')) return;
    await record('cctvWatch', await cctvWatch.tick());
  },
};

const timers = [];
function every(name, seconds) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await withLock(name, JOBS[name]); } catch (e) { state[name] = { at: new Date().toISOString(), error: e.message }; console.warn(`job ${name}: ${e.message}`); }
    running = false;
  };
  timers.push(setInterval(run, seconds * 1000), setTimeout(run, 5000));
}

function start() {
  if (!config.jobsEnabled) return console.log('Background jobs disabled (JOBS_ENABLED=false)');
  every('overdue', 300);
  every('autoAssign', 60);
  every('cameraHealth', config.cameraHealthIntervalS);
  every('cctvWatch', config.cctvWatchIntervalS);
}
const stop = () => timers.forEach(t => clearInterval(t));

async function status() {
  const rows = (await query('SELECT name, last_run, detail FROM job_runs')).rows;
  return { enabled: config.jobsEnabled, timezone: config.timezone, runs: Object.fromEntries(rows.map(r => [r.name, { lastRun: r.last_run, detail: r.detail }])), camera: cameraHealth.status };
}

module.exports = { start, stop, status, run: name => withLock(name, () => JOBS[name](true)), localParts, autoAssignDue };
