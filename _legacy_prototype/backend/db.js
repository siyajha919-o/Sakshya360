// SQLite persistence via Node's built-in node:sqlite (Node >= 22.5). Swap for PostgreSQL/PostGIS in production.
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { buildSeed } = require('./seed');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'sakshya.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT, scheme TEXT, ngo TEXT, district TEXT, state TEXT,
    lat REAL, lng REAL, sanctioned INTEGER, incharge TEXT,
    attendance TEXT, inspection_days TEXT, cameras TEXT, staff TEXT,
    last_inspected_days_ago INTEGER, complaints INTEGER, fund_utilisation INTEGER
  );
  CREATE TABLE IF NOT EXISTS inspectors (
    id TEXT PRIMARY KEY, name TEXT, team TEXT, home_state TEXT, lat REAL, lng REAL, load INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, role TEXT, user_id TEXT, created INTEGER);
  CREATE TABLE IF NOT EXISTS assignments (
    id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id), inspector_id TEXT REFERENCES inspectors(id),
    created INTEGER, due INTEGER, status TEXT, seed INTEGER
  );
  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY, assignment_id TEXT REFERENCES assignments(id), project_id TEXT, inspector_id TEXT, ts INTEGER,
    lat REAL, lng REAL, accuracy REAL, distance_m INTEGER, geo_ok INTEGER, simulated INTEGER,
    checklist TEXT, score INTEGER, headcount INTEGER, register_count INTEGER, remarks TEXT, signature TEXT
  );
  CREATE TABLE IF NOT EXISTS photos (
    hash TEXT PRIMARY KEY, report_id TEXT REFERENCES reports(id), file TEXT, ts INTEGER, lat REAL, lng REAL
  );
  CREATE TABLE IF NOT EXISTS vc_calls (
    id TEXT PRIMARY KEY, project_id TEXT, person TEXT, started INTEGER, ended INTEGER, outcome TEXT, checks INTEGER, caller TEXT
  );
  CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, who TEXT, ts INTEGER, distance_m INTEGER, ok INTEGER, simulated INTEGER, selfie_hash TEXT
  );
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, actor TEXT, role TEXT, action TEXT, detail TEXT, prev_hash TEXT, hash TEXT
  );
`);

if (db.prepare('SELECT COUNT(*) n FROM projects').get().n === 0) {
  const { projects, inspectors } = buildSeed();
  const ip = db.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  projects.forEach(p => ip.run(p.id, p.name, p.scheme, p.ngo, p.district, p.state, p.lat, p.lng, p.sanctioned, p.incharge,
    JSON.stringify(p.attendance), JSON.stringify(p.inspectionDays), JSON.stringify(p.cameras), JSON.stringify(p.staff),
    p.lastInspectedDaysAgo, p.complaints, p.fundUtilisation));
  const ii = db.prepare('INSERT INTO inspectors VALUES (?,?,?,?,?,?,?)');
  inspectors.forEach(i => ii.run(i.id, i.name, i.team, i.homeState, i.lat, i.lng, i.load));
  console.log('Seeded database');
}

const rowToProject = r => r && ({
  id: r.id, name: r.name, scheme: r.scheme, ngo: r.ngo, district: r.district, state: r.state, lat: r.lat, lng: r.lng,
  sanctioned: r.sanctioned, incharge: r.incharge, attendance: JSON.parse(r.attendance), inspectionDays: JSON.parse(r.inspection_days),
  cameras: JSON.parse(r.cameras), staff: JSON.parse(r.staff), lastInspectedDaysAgo: r.last_inspected_days_ago,
  complaints: r.complaints, fundUtilisation: r.fund_utilisation,
});
const rowToInspector = r => r && ({ id: r.id, name: r.name, team: r.team, homeState: r.home_state, lat: r.lat, lng: r.lng, load: r.load });

module.exports = {
  db, DATA_DIR,
  projects: () => db.prepare('SELECT * FROM projects ORDER BY id').all().map(rowToProject),
  project: id => rowToProject(db.prepare('SELECT * FROM projects WHERE id = ?').get(id)),
  inspectors: () => db.prepare('SELECT * FROM inspectors ORDER BY id').all().map(rowToInspector),
  inspector: id => rowToInspector(db.prepare('SELECT * FROM inspectors WHERE id = ?').get(id)),
};
