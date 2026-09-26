// Seeds demo data. Production: nightly sync from scheme MIS (e-Anudaan / PFMS) instead.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { cameraOutageDir } = require('../config');
const { pool, tx } = require('./pg');
const { migrate } = require('./migrate');

// Deterministic PRNG so every fresh database looks the same.
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROJECTS = [
  ['P101', 'Integrated Rehab Centre for Addicts', 'NAPDDR', 'Navjeevan Seva Samiti', 'Lucknow', 'Uttar Pradesh', 26.8467, 80.9462, 30, 'Dr. R. K. Verma'],
  ['P102', 'Senior Citizens Home', 'AVYAY', 'Aashray Foundation', 'Patna', 'Bihar', 25.5941, 85.1376, 50, 'Smt. Anita Kumari'],
  ['P103', 'SMILE Shelter Home', 'SMILE', 'Garima Trust', 'Bhopal', 'Madhya Pradesh', 23.2599, 77.4126, 40, 'Sh. Mohan Patel'],
  ['P104', 'PM-DAKSH Skill Training Centre', 'PM-DAKSH', 'Kaushal Vikas Sansthan', 'Jaipur', 'Rajasthan', 26.9124, 75.7873, 60, 'Sh. Vikram Singh'],
  ['P105', 'SHRESHTA Residential Hostel', 'SHRESHTA', 'Vidya Jyoti Society', 'Nagpur', 'Maharashtra', 21.1458, 79.0882, 100, 'Smt. Leena Wankhede'],
  ['P106', 'Garima Greh (Transgender Shelter)', 'SMILE', 'Samanvay Collective', 'Kolkata', 'West Bengal', 22.5726, 88.3639, 25, 'Ms. Ranjita Das'],
  ['P107', 'Senior Citizens Day Care', 'AVYAY', 'Sahara Welfare Org', 'Bengaluru', 'Karnataka', 12.9716, 77.5946, 45, 'Sh. Prakash Rao'],
  ['P108', 'Outreach & Drop-in Centre', 'NAPDDR', 'Nai Disha Foundation', 'Amritsar', 'Punjab', 31.634, 74.8723, 35, 'Sh. Gurpreet Sandhu'],
];
const INSPECTORS = [
  ['I01', 'Arjun Mehta', 'PMU Delhi', 'Uttar Pradesh', 28.6139, 77.209, 2],
  ['I02', 'Priya Nair', 'PMU South', 'Karnataka', 12.9716, 77.5946, 1],
  ['I03', 'Sanjay Ghosh', 'PMU East', 'West Bengal', 22.5726, 88.3639, 3],
  ['I04', 'Neha Joshi', 'PMU West', 'Maharashtra', 19.076, 72.8777, 3],
  ['I05', 'Farhan Qureshi', 'PMU Central', 'Madhya Pradesh', 23.2599, 77.4126, 2],
  ['I06', 'Harpreet Kaur', 'PMU North', 'Punjab', 30.7333, 76.7794, 2],
];
// Malpractice patterns planted so the analytics has something real to find.
const PATTERN = { P103: 'flat_register', P106: 'inspection_spike', P108: 'over_report' };
const CAMERA_LABELS = ['Main Gate', 'Dormitory', 'Kitchen', 'Activity Hall'];
const DEMO_PASSWORD = 'demo@123';

async function seed({ force = false } = {}) {
  await migrate();
  const { rows } = await pool.query('SELECT COUNT(*)::int n FROM projects');
  if (rows[0].n > 0 && !force) return false;

  const rnd = mulberry32(26095);
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const dayAgo = d => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);

  await tx(async c => {
    if (force) await c.query('TRUNCATE feedback, cctv_observations, otp_codes, push_tokens, job_runs, inspection_visits, vc_sessions, evidence, reports, assignments, checkins, attendance_daily, cameras, people, users, projects CASCADE');
    // Simulated cameras that start offline get an outage marker so MediaMTX refuses to stream them.
    fs.mkdirSync(cameraOutageDir, { recursive: true });
    for (const f of fs.readdirSync(cameraOutageDir)) if (/^P\d+_\d$/.test(f)) fs.rmSync(path.join(cameraOutageDir, f));

    for (const [id, name, scheme, ngo, district, state, lat, lng, sanctioned, incharge] of PROJECTS) {
      const pattern = PATTERN[id];
      await c.query(
        `INSERT INTO projects (id, name, scheme, ngo, district, state, location, sanctioned, fund_utilisation, complaints, last_inspected)
         VALUES ($1,$2,$3,$4,$5,$6, ST_MakePoint($8,$7)::geography, $9, $10, $11, now() - make_interval(days => $12))`,
        [id, name, scheme, ngo, district, state, lat, lng, sanctioned, Math.round(55 + rnd() * 45), Math.floor(rnd() * 3) + (pattern ? 2 : 0), Math.floor(rnd() * 120)]);

      const people = [[`${id}-S1`, incharge, 'incharge'], [`${id}-S2`, ['Sunita Devi', 'Rakesh Kumar', 'Imran Khan', 'Kavya Iyer'][Math.floor(rnd() * 4)], 'staff'],
        [`${id}-B1`, ['Ramesh Yadav', 'Lata Bai', 'Joseph D\'Souza', 'Meena Kumari'][Math.floor(rnd() * 4)], 'beneficiary'], [`${id}-B2`, ['Suresh Pal', 'Geeta Rani', 'Abdul Rahim', 'Kamla Devi'][Math.floor(rnd() * 4)], 'beneficiary']];
      for (const [pid, pname, kind] of people) {
        // The first beneficiary of each centre gets a predictable demo number for OTP login: P101 -> +91 90000 00101.
        const random = '+91 9' + String(Math.floor(rnd() * 1e9)).padStart(9, '0');
        const phone = pid.endsWith('-B1') ? `+91 90000 00${id.slice(1)}` : random;
        await c.query('INSERT INTO people (id, project_id, name, kind, phone) VALUES ($1,$2,$3,$4,$5)', [pid, id, pname, kind, phone]);
      }

      for (let n = 1; n <= 4; n++) {
        const online = !(pattern === 'flat_register' && n > 2) && rnd() > 0.08;
        await c.query(`INSERT INTO cameras (id, project_id, label, online, source, offline_since) VALUES ($1,$2,$3,$4,'simulated', CASE WHEN $4 THEN NULL ELSE now() END)`,
          [`${id}_${n}`, id, CAMERA_LABELS[n - 1], online]);
        if (!online) fs.writeFileSync(path.join(cameraOutageDir, `${id}_${n}`), 'seeded outage');
      }

      const visits = pattern === 'inspection_spike' ? [3, 17] : [Math.floor(rnd() * 30)];
      for (const d of visits) await c.query('INSERT INTO inspection_visits VALUES ($1,$2)', [id, dayAgo(d)]);

      const base = Math.round(sanctioned * (0.7 + rnd() * 0.2));
      for (let d = 30; d >= 1; d--) {
        let v = Math.round(base + (rnd() - 0.5) * sanctioned * 0.15);
        if (pattern === 'flat_register') v = sanctioned;
        if (pattern === 'inspection_spike') v = visits.includes(d) ? sanctioned : Math.round(base * 0.45);
        if (pattern === 'over_report' && d <= 10) v = sanctioned + 6;
        await c.query('INSERT INTO attendance_daily (project_id, day, count) VALUES ($1,$2,$3)', [id, dayAgo(d), Math.max(0, v)]);
      }

      await c.query(`INSERT INTO users (id, email, password_hash, name, role, project_id, state) VALUES ($1,$2,$3,$4,'ngo',$5,$6)`,
        [`U-${id}`, `${id.toLowerCase()}@ngo.sakshya360.in`, hash, `${incharge} (${ngo})`, id, state]);
    }

    for (const [id, name, team, homeState, lat, lng, capacity] of INSPECTORS) {
      await c.query(`INSERT INTO users (id, email, password_hash, name, role, state, team, base_location, capacity)
        VALUES ($1,$2,$3,$4,'inspector',$5,$6, ST_MakePoint($8,$7)::geography, $9)`,
        [id, `${id.toLowerCase()}@pmu.sakshya360.in`, hash, name, homeState, team, lat, lng, capacity]);
    }
    await c.query(`INSERT INTO users (id, email, password_hash, name, role) VALUES ('OFF01','official@dosje.gov.in',$1,'DoSJE Monitoring Cell','official')`, [hash]);
    await c.query(`INSERT INTO users (id, email, password_hash, name, role, state) VALUES ('ST-UP','state.up@dosje.gov.in',$1,'Social Welfare Dept, Uttar Pradesh','state','Uttar Pradesh')`, [hash]);
    await c.query(`INSERT INTO users (id, email, password_hash, name, role, state, district) VALUES ('DT-LKO','district.lucknow@dosje.gov.in',$1,'District Social Welfare Officer, Lucknow','district','Uttar Pradesh','Lucknow')`, [hash]);

    // A few grievances so the beneficiary channel has history (P103's register is the planted fraud).
    const GRIEVANCES = [
      ['G0seed000001', 'P103', 'P103-B1', 'app', 'fake_attendance', 1, false, false, 'रजिस्टर में रोज़ 40 लोग दिखाए जाते हैं, पर यहाँ 15-20 ही रहते हैं।', 'hi', 3],
      ['G0seed000002', 'P103', null, 'qr', 'food', 2, true, false, 'Dinner not served on two days this week.', 'en', 5],
      ['G0seed000003', 'P101', 'P101-B1', 'app', 'praise', 5, true, true, 'Counsellor visits regularly, food is good.', 'en', 8],
    ];
    for (const [gid, pid, person, channel, category, rating, present, servicesOk, text, lang, daysAgo] of GRIEVANCES) {
      await c.query(`INSERT INTO feedback (id, project_id, person_id, channel, category, rating, present, services_ok, text, lang, created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now() - make_interval(days => $11))`, [gid, pid, person, channel, category, rating, present, servicesOk, text, lang, daysAgo]);
    }
  });
  return true;
}

if (require.main === module) {
  seed({ force: process.argv.includes('--force') })
    .then(done => { console.log(done ? `Seeded. All demo passwords: ${DEMO_PASSWORD}` : 'Already seeded (use --force to reset)'); return pool.end(); })
    .catch(e => { console.error(e); process.exit(1); });
}
module.exports = { seed, DEMO_PASSWORD };
