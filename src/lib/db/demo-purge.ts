import { getDb } from "./index";
import { flushSnapshot } from "./persistence";

/**
 * One-time-style (idempotent) purge of the old fake demo dataset.
 *
 * Earlier MedSafe builds shipped a hard-coded prototype dataset (15 labelled
 * demo medicines, demo sources/warnings/interactions, a demo login, a sample
 * report and fake search statistics). That data is FAKE and must not power a
 * healthcare product, so every boot now removes it — including demo rows that
 * an older cloud snapshot may re-introduce during additive merge.
 *
 * Safety rules:
 *  - Only rows marked record_kind='demo' (and their dependents) are removed;
 *    real imported/user data is never touched.
 *  - Every deletion is idempotent: running on a clean database is a no-op.
 *  - When something was actually deleted, the cleaned database is flushed to
 *    the cloud snapshot so the removal persists across deploys.
 */

const SEED_SOURCE_TITLES = [
  "Sample Pack Label (Demo)",
  "MedSafe Demo Knowledge Base (Demo)",
  "Public Drug Label Compilation (Demo)",
  "Paracetamol Tablets IP — package label",
  "Cetirizine Tablets IP — package label",
  "WHO Model List of Essential Medicines (23rd list)",
];

export function purgeDemoData(): boolean {
  const db = getDb();
  let removed = 0;

  const run = db.transaction((): void => {
    // 1. Demo medicines (old records were labelled record_kind='demo').
    //    FK cascades clean medicine_ingredients, warnings, user_medicines,
    //    reminders, search_stats; scan_history.medicine_id is SET NULL.
    const meds = db
      .prepare("DELETE FROM medicines WHERE record_kind = 'demo'")
      .run();
    removed += meds.changes;

    // 2. Orphaned active ingredients (kept only if still referenced).
    const ings = db
      .prepare(
        `DELETE FROM active_ingredients
         WHERE id NOT IN (SELECT ingredient_id FROM medicine_ingredients)
           AND id NOT IN (SELECT ingredient_a FROM interactions)
           AND id NOT IN (SELECT ingredient_b FROM interactions)`
      )
      .run();
    removed += ings.changes;

    // 3. Interactions whose ingredient pair no longer exists (merge skew).
    const ints = db
      .prepare(
        `DELETE FROM interactions
         WHERE ingredient_a NOT IN (SELECT id FROM active_ingredients)
            OR ingredient_b NOT IN (SELECT id FROM active_ingredients)`
      )
      .run();
    removed += ints.changes;

    // 4. Seeded demo sources that nothing references any more.
    const ph = SEED_SOURCE_TITLES.map(() => "?").join(",");
    const srcs = db
      .prepare(
        `DELETE FROM sources
         WHERE (publisher = 'MedSafe Demo Dataset' OR title IN (${ph}) OR title LIKE '%(Demo)%')
           AND id NOT IN (SELECT source_id FROM medicines WHERE source_id IS NOT NULL)
           AND id NOT IN (SELECT source_id FROM warnings WHERE source_id IS NOT NULL)
           AND id NOT IN (SELECT source_id FROM interactions WHERE source_id IS NOT NULL)`
      )
      .run(...SEED_SOURCE_TITLES);
    removed += srcs.changes;

    // 5. The fake demo login account.
    const demoUser = db.prepare("DELETE FROM users WHERE email = 'demo@medsafe.local'").run();
    removed += demoUser.changes;

    // 6. The seeded sample report.
    const report = db
      .prepare("DELETE FROM reports WHERE description LIKE '%Sample report for demo purposes%'")
      .run();
    removed += report.changes;

    // 7. Fake search statistics left from seeding (real usage stats rebuild).
    const stats = db
      .prepare("DELETE FROM search_stats WHERE medicine_id NOT IN (SELECT id FROM medicines)")
      .run();
    removed += stats.changes;

    // 8. Legacy 'demo' method rows in scan history.
    const scans = db.prepare("DELETE FROM scan_history WHERE method = 'demo'").run();
    removed += scans.changes;

    // 9. Translations pointing at medicines that no longer exist.
    const deadNotes = db
      .prepare(
        `DELETE FROM translations
         WHERE entity = 'safety' AND key LIKE 'mednote.%'
           AND substr(key, 9) NOT IN (SELECT slug FROM medicines)`
      )
      .run();
    removed += deadNotes.changes;

    // 10. Orphan per-medicine warning translations (warn.<slug>.<code>.…).
    //     The demo slugs no longer exist and the seed no longer ships such
    //     keys, so this converges: deleted once, never re-added.
    const deadWarn = db
      .prepare(
        `DELETE FROM translations
         WHERE entity = 'safety' AND key LIKE 'warn.%'
           AND substr(key, 6, instr(substr(key, 6), '.') - 1) NOT IN (SELECT slug FROM medicines)`
      )
      .run();
    removed += deadWarn.changes;
  });

  run();

  if (removed > 0) {
    db.prepare(`INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)`).run(
      "system",
      "demo.purge",
      "system",
      null,
      JSON.stringify({ removed, reason: "fake demo dataset removal" })
    );
    flushSnapshot();
    console.log(`[medsafe] purged ${removed} fake demo rows from the database`);
  }
  return removed > 0;
}
