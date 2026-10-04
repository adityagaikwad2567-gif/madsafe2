import bcrypt from "bcryptjs";
import { getDb } from "./index";
import { SAFETY_TRANSLATIONS } from "@/lib/i18n/safety-translations";

/**
 * MedSafe boot seeding — REAL DATA ONLY.
 *
 * This module intentionally contains NO medicine records, NO fake users and
 * NO sample reports. All medicine data must arrive through the admin CSV/JSON
 * import (or the admin CRUD) so every record carries a real source and
 * verification status.
 *
 * What is seeded:
 *  1. Safety-content translations (hi/mr UI wording) — re-synced every boot.
 *  2. The admin account from ADMIN_EMAIL / ADMIN_PASSWORD — created once if
 *     missing, so a fresh database is administrable immediately.
 */

export function seedTranslations(): void {
  const db = getDb();
  const ins = db.prepare(
    `INSERT INTO translations (entity, key, lang, value) VALUES ('safety', ?, ?, ?)
     ON CONFLICT(entity, key, lang) DO UPDATE SET value = excluded.value`
  );
  const run = db.transaction(() => {
    for (const t of SAFETY_TRANSLATIONS) ins.run(t.key, t.lang, t.value);
  });
  run();
}

/** Idempotent admin bootstrap from environment variables. */
export function ensureAdminUser(): void {
  const db = getDb();
  const email = (process.env.ADMIN_EMAIL ?? "admin@medsafe.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "Admin@1234";

  const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email) as
    | { id: number }
    | undefined;

  if (existing) {
    // Keep the env-provided credentials authoritative for this account.
    db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(
      bcrypt.hashSync(password, 10),
      existing.id
    );
    const hasAdmin = db.prepare("SELECT 1 FROM admins WHERE user_id = ?").get(existing.id);
    if (!hasAdmin) db.prepare("INSERT INTO admins (user_id) VALUES (?)").run(existing.id);
    return;
  }

  const run = db.transaction(() => {
    const id = db
      .prepare("INSERT INTO users (name, email, password_hash, role, language) VALUES (?,?,?,?,?)")
      .run("MedSafe Admin", email, bcrypt.hashSync(password, 10), "admin", "en").lastInsertRowid as number;
    db.prepare("INSERT INTO admins (user_id) VALUES (?)").run(id);
  });
  run();
  console.log(`[medsafe] admin account ensured for ${email}`);
}

export function seedIfEmpty(): void {
  seedTranslations();
  ensureAdminUser();
}
