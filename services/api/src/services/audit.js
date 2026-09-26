// Hash-chained audit log. Each entry's hash covers the previous hash, so any edit breaks the chain.
const crypto = require('crypto');
const { pool } = require('../db/pg');

const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
// JSONB reorders object keys, so hash a key-sorted form to get the same digest after a round-trip.
const canonical = v => Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const digest = (prev, e) => sha256(prev + JSON.stringify(canonical([new Date(e.ts).toISOString(), e.actor, e.role, e.action, e.detail])));

async function audit(user, action, detail = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE audit_log IN EXCLUSIVE MODE'); // serialise chain appends
    const last = await client.query('SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1');
    const prev = last.rows[0] ? last.rows[0].hash : 'GENESIS';
    const e = { ts: new Date(Math.floor(Date.now() / 1000) * 1000), actor: user ? user.id : null, role: user ? user.role : null, action, detail };
    await client.query('INSERT INTO audit_log (ts, actor, role, action, detail, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [e.ts, e.actor, e.role, action, detail, prev, digest(prev, e)]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function verify() {
  const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY id');
  let prev = 'GENESIS';
  for (const e of rows) {
    if (e.prev_hash !== prev || e.hash !== digest(prev, e)) return { ok: false, brokenAt: Number(e.id), checked: rows.indexOf(e) };
    prev = e.hash;
  }
  return { ok: true, checked: rows.length };
}

module.exports = { audit, verify, sha256 };
