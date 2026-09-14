# MedSafe Database Documentation

Engine: **SQLite** via `better-sqlite3` (zero-setup, synchronous, ideal for the single-node demo profile).
The schema is deliberately PostgreSQL-mappable — types and constraints were written so a future `pg`
migration is mostly mechanical (see "PostgreSQL migration" below).

Boot behaviour: `src/lib/db/index.ts` creates all tables (`schema.sql`), runs in-place column migrations,
and `src/lib/db/seed.ts` seeds demo data + translations on first access (and re-syncs translations every boot).

## Entity map (18 tables)

```
users ──┬── sessions            (1:N, token + expiry, DELETE CASCADE)
        ├── user_medicines ───── medicines          (cabinet; expiry date per user)
        │     └── reminders
        ├── scan_history        (privacy-friendly: user_id nullable)
        └── reports             (author nullable — anonymous reports allowed)

medicines ──┬── medicine_ingredients ── active_ingredients
            ├── warnings
            └── sources (N:1)     (title, url, document_name, publication_date, last_checked, verification_status)

interactions ── active_ingredients × 2 + sources   (documented, always cite a source)

translations        (entity/key/lang/content — hi+mr safety layer, re-synced on boot)
audit_log           (actor, action, entity, entity_id, details)
import_history      (actor, format, filename, counts, errors_json)
search_stats        (anonymous query frequency for the admin chart)
```

## Key columns & constraints

| Table | Notables |
| --- | --- |
| `users` | `email UNIQUE`, `role CHECK(user,admin)`, `language CHECK(en,hi,mr)`, `password_hash` = bcrypt (never plain), `active` (deactivation), `privacy` JSON; cycle fields are optional and never exposed via admin APIs |
| `sessions` | 32-byte random token PK, `expires_at` checked server-side on every request; expired rows GC'd on new logins |
| `medicines` | `slug UNIQUE`, `record_kind CHECK(demo,real)`, `verification CHECK(verified,unverified)`, `data_confidence CHECK(high,medium,low)`, `source_id FK sources` |
| `medicine_ingredients` | FK pair `(medicine_id, ingredient_id)` with per-record `strength` |
| `sources` | `verification_status CHECK(verified,pending,rejected)`; new imports start `pending` |
| `reports` | `type CHECK(expired,damaged_packaging,incorrect_label,suspicious_sale,info_mismatch)`, `status CHECK(open,reviewed,resolved)` |
| `audit_log` | every admin mutation: actor email, action, entity, id, JSON details |

## Migrations

In-place, idempotent column migrations run on every boot (`migrate()` in `src/lib/db/index.ts`);
each `ALTER TABLE ADD COLUMN` is skipped if the column already exists. Fresh databases are created
entirely from `schema.sql`. There is no separate migration step to run — deploy and boot.

Manual commands:

```bash
npm run db:seed    # create + seed without booting the server
npm run db:reset   # delete medsafe.db (fresh seed on next boot) — destructive
npm run db:backup  # VACUUM INTO medsafe-backup-YYYY-MM-DD.db (safe while running)
```

## PostgreSQL migration path

1. Set `DATABASE_URL` and create a `pg` Pool-based client with the same interface as `getDb()`
   (the codebase funnels all SQL through that one module).
2. Type mapping used by the schema: `TEXT → TEXT`, `INTEGER booleans → BOOLEAN`, `datetime('now') → now()`,
   `AUTOINCREMENT → GENERATED ALWAYS AS IDENTITY`.
3. Replace SQLite-only snippets: `ifnull(→COALESCE(`, `datetime('now') → now()`,
   `INSERT OR REPLACE → ON CONFLICT … DO UPDATE`.
4. Scheduled jobs (session GC) become `pg_cron` or app-level intervals.

## Backup & restore

```bash
npm run db:backup                       # consistent snapshot while the server runs
# restore: stop server, replace the db file, start server
```

Back up on a schedule in production (daily cron is sufficient for the demo profile).
