/**
 * Next.js instrumentation hook — runs once per server process start.
 * Ensures the demo database exists and is seeded before the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { seedIfEmpty } = await import("./lib/db/seed");
    seedIfEmpty();
  }
}
