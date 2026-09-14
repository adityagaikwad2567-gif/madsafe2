import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * SQLite (better-sqlite3) database client for the MedSafe prototype.
 * The schema lives in schema.sql and maps 1:1 to the PostgreSQL design in the README.
 * Swap this file for a `pg` Pool-based client to move to Postgres later.
 */

const DB_PATH = process.env.MEDSAFE_DB_PATH ?? path.join(process.cwd(), "medsafe.db");

declare global {
  // eslint-disable-next-line no-var
  var __medsafeDb: Database.Database | undefined;
}

function createDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(process.cwd(), "src", "lib", "db", "schema.sql"), "utf8");
  db.exec(schema);
  migrate(db);
  return db;
}

/**
 * In-place migrations for databases created by older MedSafe versions.
 * `CREATE TABLE IF NOT EXISTS` handles new tables; ALTER TABLE adds new columns.
 * Each statement is wrapped so a "duplicate column" on an already-migrated DB is harmless.
 */
function migrate(db: Database.Database): void {
  const migrations: Array<[string, string]> = [
    ["sources.document_name", `ALTER TABLE sources ADD COLUMN document_name TEXT`],
    ["sources.publication_date", `ALTER TABLE sources ADD COLUMN publication_date TEXT`],
    ["sources.last_checked", `ALTER TABLE sources ADD COLUMN last_checked TEXT`],
    ["sources.verification_status", `ALTER TABLE sources ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'pending'`],
    ["medicines.verification_notes", `ALTER TABLE medicines ADD COLUMN verification_notes TEXT`],
    ["medicines.record_kind", `ALTER TABLE medicines ADD COLUMN record_kind TEXT NOT NULL DEFAULT 'demo'`],
    ["medicines.contraindications", `ALTER TABLE medicines ADD COLUMN contraindications TEXT NOT NULL DEFAULT '[]'`],
    ["medicines.data_confidence", `ALTER TABLE medicines ADD COLUMN data_confidence TEXT NOT NULL DEFAULT 'low'`],
    ["active_ingredients.description", `ALTER TABLE active_ingredients ADD COLUMN description TEXT`],
    ["interactions.interaction_type", `ALTER TABLE interactions ADD COLUMN interaction_type TEXT`],
    ["users.active", `ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1`],
  ];
  const existing = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => (r as { name: string }).name)
  );
  const colsOf = (table: string): Set<string> =>
    existing.has(table)
      ? new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r) => (r as { name: string }).name))
      : new Set<string>();
  for (const [key, ddl] of migrations) {
    const [table, col] = key.split(".");
    if (!existing.has(table) || colsOf(table).has(col)) continue;
    try {
      db.exec(ddl);
    } catch {
      /* already added by a concurrent process */
    }
  }
}

/** Singleton database instance (survives Next.js dev hot reloads). */
export function getDb(): Database.Database {
  if (!globalThis.__medsafeDb) globalThis.__medsafeDb = createDb();
  return globalThis.__medsafeDb;
}

export function jsonArray(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}
