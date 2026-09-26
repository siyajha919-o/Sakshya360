-- Sakshya360 relational schema (PostgreSQL 16 + PostGIS).
-- Binary evidence (photos/videos) lives in MongoDB GridFS; rows here keep its id + SHA-256.
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS projects (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  scheme          TEXT NOT NULL,
  ngo             TEXT NOT NULL,
  district        TEXT NOT NULL,
  state           TEXT NOT NULL,
  location        GEOGRAPHY(POINT, 4326) NOT NULL,
  geofence_m      INTEGER NOT NULL DEFAULT 250,
  sanctioned      INTEGER NOT NULL,
  fund_utilisation INTEGER NOT NULL DEFAULT 80,
  complaints      INTEGER NOT NULL DEFAULT 0,
  last_inspected  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS projects_location_gix ON projects USING GIST (location);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('official', 'inspector', 'ngo', 'state')),
  project_id    TEXT REFERENCES projects(id),   -- ngo users
  state         TEXT,                           -- state/district authority scope, inspector home state
  team          TEXT,
  base_location GEOGRAPHY(POINT, 4326),
  capacity      INTEGER NOT NULL DEFAULT 3
);

-- Staff and beneficiaries registered at a project; face embedding from OpenCV SFace for attendance.
CREATE TABLE IF NOT EXISTS people (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id),
  name           TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('incharge', 'staff', 'beneficiary')),
  phone          TEXT,
  face_embedding REAL[],
  face_enrolled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cameras (
  id           TEXT PRIMARY KEY,           -- also the MediaMTX path name
  project_id   TEXT NOT NULL REFERENCES projects(id),
  label        TEXT NOT NULL,
  online       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_daily (
  project_id  TEXT NOT NULL REFERENCES projects(id),
  day         DATE NOT NULL,
  count       INTEGER NOT NULL,
  source      TEXT NOT NULL DEFAULT 'register',
  PRIMARY KEY (project_id, day)
);

CREATE TABLE IF NOT EXISTS checkins (
  id          BIGSERIAL PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  person_id   TEXT NOT NULL REFERENCES people(id),
  ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
  location    GEOGRAPHY(POINT, 4326) NOT NULL,
  distance_m  INTEGER NOT NULL,
  within_fence BOOLEAN NOT NULL,
  face_score  REAL,
  face_match  BOOLEAN,
  accepted    BOOLEAN NOT NULL,
  evidence_id TEXT,
  simulated   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS assignments (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  inspector_id TEXT NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at       TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'overdue')),
  batch_id     TEXT,
  seed         BIGINT,
  solver       JSONB
);

CREATE TABLE IF NOT EXISTS reports (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL UNIQUE REFERENCES assignments(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  inspector_id   TEXT NOT NULL REFERENCES users(id),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  location       GEOGRAPHY(POINT, 4326) NOT NULL,
  accuracy_m     REAL,
  distance_m     INTEGER NOT NULL,
  within_fence   BOOLEAN NOT NULL,
  simulated      BOOLEAN NOT NULL DEFAULT FALSE,
  checklist      JSONB NOT NULL,
  score          INTEGER NOT NULL,
  headcount      INTEGER NOT NULL,
  register_count INTEGER NOT NULL,
  remarks        TEXT,
  signature      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id          TEXT PRIMARY KEY,            -- GridFS ObjectId (hex)
  sha256      TEXT UNIQUE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('photo', 'video', 'selfie', 'cctv')),
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  report_id   TEXT REFERENCES reports(id),
  project_id  TEXT REFERENCES projects(id),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  location    GEOGRAPHY(POINT, 4326),
  uploaded_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vc_sessions (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id),
  person_id   TEXT NOT NULL REFERENCES people(id),
  room        TEXT NOT NULL,
  caller_id   TEXT NOT NULL REFERENCES users(id),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ,
  outcome     TEXT,
  checks      JSONB
);

-- Append-only, hash-chained audit trail.
CREATE TABLE IF NOT EXISTS audit_log (
  id        BIGSERIAL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor     TEXT,
  role      TEXT,
  action    TEXT NOT NULL,
  detail    JSONB,
  prev_hash TEXT NOT NULL,
  hash      TEXT NOT NULL
);
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Historical inspection dates (imported from legacy MIS) used by the inspection-day spike detector.
CREATE TABLE IF NOT EXISTS inspection_visits (
  project_id TEXT NOT NULL REFERENCES projects(id),
  day        DATE NOT NULL,
  PRIMARY KEY (project_id, day)
);

-- ---------------------------------------------------------------------------
-- v2: district scope, beneficiaries, grievances, push, automation, camera health.
-- Written as idempotent ALTERs so existing databases upgrade in place.
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS district TEXT;   -- district authority scope
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('official', 'inspector', 'ngo', 'state', 'district'));

ALTER TABLE cameras ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'rtsp';  -- 'rtsp' (real) | 'simulated'
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS offline_since TIMESTAMPTZ;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_checked TIMESTAMPTZ;
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Client-side capture time (reports can be queued offline and synced later).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS delayed_sync BOOLEAN NOT NULL DEFAULT FALSE;

-- Periodic CCTV occupancy checks (frame pulled server-side from the stream).
CREATE TABLE IF NOT EXISTS cctv_observations (
  id             BIGSERIAL PRIMARY KEY,
  camera_id      TEXT NOT NULL REFERENCES cameras(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  ts             TIMESTAMPTZ NOT NULL DEFAULT now(),
  persons        INTEGER NOT NULL,
  register_count INTEGER NOT NULL,
  expected       REAL NOT NULL,
  suspicious     BOOLEAN NOT NULL,
  evidence_id    TEXT
);
CREATE INDEX IF NOT EXISTS cctv_observations_project_ts ON cctv_observations (project_id, ts DESC);

-- Beneficiary / citizen feedback and grievances (in-app after OTP, or anonymous via the centre's QR code).
CREATE TABLE IF NOT EXISTS feedback (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  person_id    TEXT REFERENCES people(id),           -- NULL when anonymous
  channel      TEXT NOT NULL CHECK (channel IN ('app', 'qr')),
  category     TEXT NOT NULL,
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  present      BOOLEAN,                               -- "were you at the centre today?"
  services_ok  BOOLEAN,                               -- "did you receive the services / meals?"
  text         TEXT,
  lang         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved', 'rejected')),
  response     TEXT,
  responded_by TEXT REFERENCES users(id),
  responded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS feedback_project_created ON feedback (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone      TEXT PRIMARY KEY,                        -- last 10 digits
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0
);

-- Expo push tokens. subject is a users.id, or a people.id for beneficiaries.
CREATE TABLE IF NOT EXISTS push_tokens (
  token      TEXT PRIMARY KEY,
  subject    TEXT NOT NULL,
  role       TEXT NOT NULL,
  project_id TEXT,
  state      TEXT,
  district   TEXT,
  platform   TEXT,
  lang       TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_subject ON push_tokens (subject);

-- Key/value settings (automation schedule) and job bookkeeping.
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
CREATE TABLE IF NOT EXISTS job_runs (
  name     TEXT PRIMARY KEY,
  last_run TIMESTAMPTZ NOT NULL,
  detail   JSONB
);
