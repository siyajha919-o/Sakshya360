const fs = require('fs');
const path = require('path');
const { pool } = require('./pg');

async function migrate() {
  await pool.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
}

if (require.main === module) {
  migrate().then(() => { console.log('Migrated'); return pool.end(); }).catch(e => { console.error(e); process.exit(1); });
}
module.exports = { migrate };
