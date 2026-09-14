-- ─────────────────────────────────────────────────────────────────────────────
-- MedSafe PostgreSQL schema (Supabase / Neon / RDS ready)
--
-- Production translation of src/lib/db/schema.sql (SQLite). Types map 1:1:
-- INTEGER booleans → BOOLEAN, AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY,
-- datetime('now') → now(). Application SQL (prepared statements, joins,
-- JSON arrays stored as TEXT) is compatible as-is; only the driver import in
-- src/lib/db/index.ts changes (better-sqlite3 → pg Pool — see the swap notes
-- at the bottom of this file).
--
-- Apply on Supabase: Dashboard → SQL Editor → paste → Run.
-- Apply via psql:    psql "$DATABASE_URL" -f db/postgres/schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  language       TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  cycle_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  cycle_start    TEXT,
  cycle_length   INTEGER,
  privacy        TEXT NOT NULL DEFAULT '{}',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Shared account table for both the seeded admin and admin-registered users.
CREATE TABLE IF NOT EXISTS admins (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title        TEXT NOT NULL,
  publisher    TEXT,
  url          TEXT,
  kind         TEXT NOT NULL DEFAULT 'label' CHECK (kind IN ('label','guideline','literature','internal')),
  document_name TEXT,             -- e.g. package insert file / SmPC document reference
  publication_date TEXT,          -- date the source document was published
  last_checked TEXT,              -- date admin last confirmed the link/content
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('verified','pending','rejected')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS medicines (
  id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  record_kind       TEXT NOT NULL DEFAULT 'demo' CHECK (record_kind IN ('demo','real')), -- demo = clearly-labelled prototype data
  brand_name        TEXT,
  generic_name      TEXT,
  form              TEXT,
  strength          TEXT,
  manufacturer      TEXT,
  category          TEXT,
  barcode           TEXT UNIQUE,
  schedule_class    TEXT,            -- e.g. 'OTC', 'Prescription only', 'Schedule H'
  rx_required       BOOLEAN NOT NULL DEFAULT FALSE,
  uses              TEXT NOT NULL DEFAULT '[]',
  precautions       TEXT NOT NULL DEFAULT '[]',
  side_effects      TEXT NOT NULL DEFAULT '[]',
  contraindications TEXT NOT NULL DEFAULT '[]',
  storage           TEXT,
  pack_expiry_hint  TEXT,            -- demo only: expiry printed on the sample pack
  drowsiness        BOOLEAN NOT NULL DEFAULT FALSE,
  driving_warning   BOOLEAN NOT NULL DEFAULT FALSE,
  pregnancy_caution BOOLEAN NOT NULL DEFAULT FALSE,
  breastfeeding_caution BOOLEAN NOT NULL DEFAULT FALSE,
  menstrual_note    TEXT,
  cycle_tags        TEXT NOT NULL DEFAULT '[]',  -- ['menstrual','hormonal','delay']
  ar_zones          TEXT NOT NULL DEFAULT '[]',  -- optional AR label zones: [{kind,top,left,width,height}]
  source_id         INTEGER REFERENCES sources(id),
  verification      TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('verified','unverified')),
  verification_notes TEXT,          -- reviewer notes: what was checked, against which document
  data_confidence   TEXT NOT NULL DEFAULT 'low' CHECK (data_confidence IN ('high','medium','low')),
  verified_by       TEXT,
  last_updated      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_brand ON medicines(brand_name);
CREATE INDEX IF NOT EXISTS idx_medicines_generic ON medicines(generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_manufacturer ON medicines(manufacturer);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);
CREATE INDEX IF NOT EXISTS idx_medicines_verification ON medicines(verification);
CREATE INDEX IF NOT EXISTS idx_medicines_source ON medicines(source_id);

CREATE TABLE IF NOT EXISTS active_ingredients (
  id         INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  name_hi    TEXT,
  name_mr    TEXT,
  description TEXT,                        -- short factual description from the source, never guessed
  uniq_name  TEXT NOT NULL UNIQUE           -- canonical lowercase key, e.g. 'paracetamol'
);

CREATE TABLE IF NOT EXISTS medicine_ingredients (
  medicine_id  INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
  strength     TEXT,
  PRIMARY KEY (medicine_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_mi_ingredient ON medicine_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS warnings (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,   -- prescription | drowsiness | duplicate | pregnancy | breastfeeding | interaction | expiry | menstrual
  level       TEXT NOT NULL CHECK (level IN ('green','yellow','orange','red')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  source_id   INTEGER REFERENCES sources(id)
);
CREATE INDEX IF NOT EXISTS idx_warnings_medicine ON warnings(medicine_id);

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_a INTEGER NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
  ingredient_b INTEGER NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
  severity     TEXT NOT NULL CHECK (severity IN ('caution','orange','red')),
  interaction_type TEXT,                    -- e.g. 'pharmacodynamic', 'pharmacokinetic'
  description  TEXT NOT NULL,
  source_id    INTEGER REFERENCES sources(id)
);
CREATE INDEX IF NOT EXISTS idx_interactions_a ON interactions(ingredient_a);
CREATE INDEX IF NOT EXISTS idx_interactions_b ON interactions(ingredient_b);

CREATE TABLE IF NOT EXISTS user_medicines (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_no    TEXT,
  expiry_date TEXT,
  pack_size   TEXT,
  notes       TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_user_medicines_user ON user_medicines(user_id);

CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_medicine_id INTEGER NOT NULL REFERENCES user_medicines(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL,
  label       TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);

CREATE TABLE IF NOT EXISTS scan_history (
  id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = anonymous privacy-friendly scan
  medicine_id  INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
  method       TEXT NOT NULL CHECK (method IN ('camera','upload','barcode','manual','voice','demo')),
  query        TEXT,
  confidence   REAL,
  matched      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_history_user ON scan_history(user_id);
CREATE INDEX IF NOT EXISTS idx_scan_history_created ON scan_history(created_at);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = anonymous
  type        TEXT NOT NULL CHECK (type IN ('expired','damaged_packaging','incorrect_label','suspicious_sale','info_mismatch')),
  description TEXT NOT NULL,
  medicine_name TEXT,
  pharmacy    TEXT,
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved')),
  admin_notes TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

CREATE TABLE IF NOT EXISTS translations (
  id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity TEXT NOT NULL,          -- 'medicine' | 'warning' | 'ingredient' | 'ui'
  key    TEXT NOT NULL,
  lang   TEXT NOT NULL CHECK (lang IN ('en','hi','mr')),
  value  TEXT NOT NULL,
  UNIQUE (entity, key, lang)
);

CREATE TABLE IF NOT EXISTS search_stats (
  medicine_id INTEGER PRIMARY KEY REFERENCES medicines(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL DEFAULT 0
);

-- ── Data governance (audit + imports) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor       TEXT NOT NULL,                -- admin email or 'system'
  action      TEXT NOT NULL,                -- e.g. 'medicine.update', 'import.run', 'source.verify'
  entity      TEXT NOT NULL,                -- 'medicine' | 'ingredient' | 'interaction' | 'warning' | 'source' | 'import'
  entity_id   TEXT,                         -- id or slug of the affected record
  details     TEXT,                         -- JSON summary of what changed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS import_history (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor         TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('csv','excel','json','manual')),
  filename      TEXT,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  imported      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  errors_json   TEXT NOT NULL DEFAULT '[]', -- [{row, error, field?}]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Application swap notes (when connecting the app to this database)
--
-- src/lib/db/index.ts is the single database seam. To move to Postgres:
--   1. npm i pg && npm i -D @types/pg
--   2. Replace the better-sqlite3 import with a pg Pool bound to DATABASE_URL.
--   3. getDb() keeps its name/signature but returns the pool; .prepare(sql)
--      call sites become parameterised queries — pg uses $1, $2 … placeholders
--      instead of SQLite's ?, so keep a tiny prepare() shim that rewrites them.
--   4. Booleans: the app currently reads 0/1 integers; either keep BOOLEAN and
--      cast at read time (::int), or store SMALLINT to stay wire-compatible.
--   5. Seeding: run scripts/seed (SQL port of src/lib/db/seed.ts) or keep the
--      TS seeder behind the same shim.
-- Until that swap is executed, SQLite (MEDSAFE_DB_PATH on a persistent disk)
-- remains the supported runtime database.
-- ─────────────────────────────────────────────────────────────────────────────
