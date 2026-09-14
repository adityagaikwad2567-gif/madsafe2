-- MedSafe relational schema (SQLite via better-sqlite3)
-- SQLite is used so the prototype runs anywhere with zero setup.
-- The same schema maps 1:1 to PostgreSQL for production (see README > Production database).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  language       TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','hi','mr')),
  cycle_enabled  INTEGER NOT NULL DEFAULT 0,
  cycle_start    TEXT,
  cycle_length   INTEGER,
  privacy        TEXT NOT NULL DEFAULT '{}',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Shared account table for both the seeded admin and admin-registered users.
CREATE TABLE IF NOT EXISTS admins (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  publisher    TEXT,
  url          TEXT,
  kind         TEXT NOT NULL DEFAULT 'label' CHECK (kind IN ('label','guideline','literature','internal')),
  document_name TEXT,             -- e.g. package insert file / SmPC document reference
  publication_date TEXT,          -- date the source document was published
  last_checked TEXT,              -- date admin last confirmed the link/content
  verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('verified','pending','rejected')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS medicines (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
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
  rx_required       INTEGER NOT NULL DEFAULT 0,
  uses              TEXT NOT NULL DEFAULT '[]',
  precautions       TEXT NOT NULL DEFAULT '[]',
  side_effects      TEXT NOT NULL DEFAULT '[]',
  contraindications TEXT NOT NULL DEFAULT '[]',
  storage           TEXT,
  pack_expiry_hint  TEXT,            -- demo only: expiry printed on the sample pack
  drowsiness        INTEGER NOT NULL DEFAULT 0,
  driving_warning   INTEGER NOT NULL DEFAULT 0,
  pregnancy_caution INTEGER NOT NULL DEFAULT 0,
  breastfeeding_caution INTEGER NOT NULL DEFAULT 0,
  menstrual_note    TEXT,
  cycle_tags        TEXT NOT NULL DEFAULT '[]',  -- ['menstrual','hormonal','delay']
  ar_zones          TEXT NOT NULL DEFAULT '[]',  -- optional stored AR label zones: [{kind,top,left,width,height}]
  source_id         INTEGER REFERENCES sources(id),
  verification      TEXT NOT NULL DEFAULT 'unverified' CHECK (verification IN ('verified','unverified')),
  verification_notes TEXT,          -- reviewer notes: what was checked, against which document
  data_confidence   TEXT NOT NULL DEFAULT 'low' CHECK (data_confidence IN ('high','medium','low')),
  verified_by       TEXT,
  last_updated      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS active_ingredients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
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

CREATE TABLE IF NOT EXISTS warnings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  code        TEXT NOT NULL,   -- prescription | drowsiness | duplicate | pregnancy | breastfeeding | interaction | expiry | menstrual
  level       TEXT NOT NULL CHECK (level IN ('green','yellow','orange','red')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  source_id   INTEGER REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_a INTEGER NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
  ingredient_b INTEGER NOT NULL REFERENCES active_ingredients(id) ON DELETE CASCADE,
  severity     TEXT NOT NULL CHECK (severity IN ('caution','orange','red')),
  interaction_type TEXT,                    -- e.g. 'pharmacodynamic', 'pharmacokinetic'
  description  TEXT NOT NULL,
  source_id    INTEGER REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS user_medicines (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  medicine_id INTEGER NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  batch_no    TEXT,
  expiry_date TEXT,
  pack_size   TEXT,
  notes       TEXT,
  added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_medicine_id INTEGER NOT NULL REFERENCES user_medicines(id) ON DELETE CASCADE,
  time_of_day TEXT NOT NULL,
  label       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS scan_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL = anonymous privacy-friendly scan
  medicine_id  INTEGER REFERENCES medicines(id) ON DELETE SET NULL,
  method       TEXT NOT NULL CHECK (method IN ('camera','upload','barcode','manual','voice','demo')),
  query        TEXT,
  confidence   REAL,
  matched      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL, -- NULL = anonymous
  type        TEXT NOT NULL CHECK (type IN ('expired','damaged_packaging','incorrect_label','suspicious_sale','info_mismatch')),
  description TEXT NOT NULL,
  medicine_name TEXT,
  pharmacy    TEXT,
  location    TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved')),
  admin_notes TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS translations (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,          -- 'medicine' | 'warning' | 'ingredient' | 'ui'
  key    TEXT NOT NULL,
  lang   TEXT NOT NULL CHECK (lang IN ('en','hi','mr')),
  value  TEXT NOT NULL,
  UNIQUE (entity, key, lang)
);

CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_mi_ingredient  ON medicine_ingredients(ingredient_id);

CREATE TABLE IF NOT EXISTS search_stats (
  medicine_id INTEGER PRIMARY KEY REFERENCES medicines(id) ON DELETE CASCADE,
  count       INTEGER NOT NULL DEFAULT 0
);

-- ── Data governance (audit + imports) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor       TEXT NOT NULL,                -- admin email or 'system'
  action      TEXT NOT NULL,                -- e.g. 'medicine.update', 'import.run', 'source.verify'
  entity      TEXT NOT NULL,                -- 'medicine' | 'ingredient' | 'interaction' | 'warning' | 'source' | 'import'
  entity_id   TEXT,                         -- id or slug of the affected record
  details     TEXT,                         -- JSON summary of what changed
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

CREATE TABLE IF NOT EXISTS import_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor         TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('csv','excel','json','manual')),
  filename      TEXT,
  total_rows    INTEGER NOT NULL DEFAULT 0,
  imported      INTEGER NOT NULL DEFAULT 0,
  updated       INTEGER NOT NULL DEFAULT 0,
  rejected      INTEGER NOT NULL DEFAULT 0,
  errors_json   TEXT NOT NULL DEFAULT '[]', -- [{row, error, field?}]
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
