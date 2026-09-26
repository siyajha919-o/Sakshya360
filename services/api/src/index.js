const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
const config = require('./config');
const { pool } = require('./db/pg');
const mongo = require('./db/mongo');
const { seed } = require('./db/seed');
const { decode } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');
const ml = require('./services/ml');
const notify = require('./services/notify');
const jobs = require('./services/jobs');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.corsOrigins.includes('*') ? true : config.corsOrigins }));
app.use(express.json({ limit: '1mb' }));
app.disable('x-powered-by');
app.use(morgan('dev'));

app.get('/api/health', async (_req, res) => {
  const [pg, mg, mlh] = await Promise.all([
    pool.query('SELECT postgis_version() v').then(r => ({ ok: true, postgis: r.rows[0].v })).catch(e => ({ ok: false, error: e.message })),
    mongo.client.db('admin').command({ ping: 1 }).then(() => ({ ok: true })).catch(e => ({ ok: false, error: e.message })),
    ml.health().then(h => ({ ok: true, ...h })).catch(e => ({ ok: false, error: e.message })),
  ]);
  res.json({ ok: pg.ok && mg.ok, postgres: pg, mongo: mg, ml: mlh, jobs: await jobs.status().catch(() => null), jitsiDomain: config.jitsiDomain });
});

for (const name of ['auth', 'projects', 'assignments', 'reports', 'evidence', 'vc', 'attendance', 'cctv', 'feedback']) {
  app.use('/api', require(`./routes/${name}`));
}
app.use('/api', (_req, res) => res.status(404).json({ error: 'No such endpoint' }));
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.corsOrigins.includes('*') ? true : config.corsOrigins } });
notify.setIo(io);

// Real-time channel: monitoring users join rooms for their jurisdiction only, inspectors their own
// room, NGOs their project room (see services/notify.js).
io.use((socket, next) => {
  try { socket.user = decode(socket.handshake.auth.token); next(); } catch { next(new Error('unauthorised')); }
});
io.on('connection', socket => notify.joinRooms(socket, socket.user));

(async () => {
  await mongo.connect();
  if (await seed()) console.log('Database seeded (demo password: demo@123)');
  server.listen(config.port, () => console.log(`Sakshya360 API on http://localhost:${config.port}`));
  jobs.start();
})().catch(e => {
  console.error('Startup failed:', e.message);
  console.error('Is the infrastructure running?  cd infra && docker compose up -d');
  process.exit(1);
});
