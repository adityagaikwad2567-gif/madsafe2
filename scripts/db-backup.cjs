/**
 * MedSafe database backup script.
 *
 * Usage: npm run db:backup
 * Creates medsafe-backup-YYYY-MM-DD.db in the project root using SQLite's
 * VACUUM INTO (consistent snapshot, safe while the server is running).
 */
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const DB_PATH = process.env.MEDSAFE_DB_PATH || path.join(process.cwd(), "medsafe.db");

if (!fs.existsSync(DB_PATH)) {
  console.error(`No database found at ${DB_PATH}. Start the app once or run "npm run db:seed" first.`);
  process.exit(1);
}

const out = path.join(process.cwd(), `medsafe-backup-${new Date().toISOString().slice(0, 10)}.db`);
const db = new Database(DB_PATH, { readonly: true });
try {
  db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
  console.log(`Backup written: ${out}`);
} finally {
  db.close();
}
