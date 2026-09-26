// Runtime-editable settings stored in PostgreSQL (defaults merged in).
const { query } = require('../db/pg');

const DEFAULTS = {
  automation: {
    autoAssign: { enabled: true, hour: 9, minute: 0, count: 3, dueInDays: 5, weekdaysOnly: true },
    cctvWatch: { enabled: true, fromHour: 8, toHour: 20 },
  },
};

const merge = (a, b) => {
  if (!b || typeof b !== 'object' || Array.isArray(b)) return b === undefined ? a : b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = a && typeof a[k] === 'object' && !Array.isArray(a[k]) ? merge(a[k], b[k]) : b[k];
  return out;
};

async function get(key) {
  const row = (await query('SELECT value FROM settings WHERE key = $1', [key])).rows[0];
  return merge(DEFAULTS[key] || {}, row ? row.value : {});
}

async function set(key, value) {
  const next = merge(await get(key), value);
  await query('INSERT INTO settings (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, next]);
  return next;
}

module.exports = { get, set, DEFAULTS };
