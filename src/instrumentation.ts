/**
 * Next.js instrumentation hook — runs once per server process start.
 * Boot order: restore cloud snapshot → purge legacy fake demo data →
 * seed translations + admin account.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Restore the latest cloud snapshot (if any) BEFORE purging/seeding, so
    //    admin imports and user data from previous instances are never lost.
    const { restoreLatestSnapshot } = await import("./lib/db/persistence");
    await restoreLatestSnapshot();
    // 2. Remove the legacy fake demo dataset (idempotent, self-healing after
    //    additive merges of older snapshots).
    const { purgeDemoData } = await import("./lib/db/demo-purge");
    purgeDemoData();
    // 3. Seed translations + the env-driven admin account.
    const { seedIfEmpty } = await import("./lib/db/seed");
    seedIfEmpty();
  }
}
