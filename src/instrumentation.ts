/**
 * Next.js instrumentation hook — runs once per server process start.
 * Ensures the demo database exists and is seeded before the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // 1. Restore the latest cloud snapshot (if any) BEFORE seeding, so admin
    //    imports and user data from previous instances are never overwritten.
    const { restoreLatestSnapshot } = await import("./lib/db/persistence");
    await restoreLatestSnapshot();
    // 2. Seed translations + demo dataset only if the database is empty.
    const { seedIfEmpty } = await import("./lib/db/seed");
    seedIfEmpty();
  }
}
