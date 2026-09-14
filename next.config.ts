import type { NextConfig } from "next";

/**
 * Vercel deployment support.
 *
 * 1. outputFileTracingIncludes: the SQLite client reads src/lib/db/schema.sql at
 *    boot; without this hint the file is not traced into the serverless bundle
 *    and boot fails. Harmless on other hosts.
 *
 * 2. /tmp fallback for SQLite: Vercel's filesystem is read-only except /tmp.
 *    Writing to /tmp keeps a temporary deployment fully functional (schema,
 *    seed, admin, scans) for the session — but /tmp is per-instance and wiped
 *    regularly, so data is ephemeral there. For durable data, set DATABASE_URL
 *    (Postgres migration per docs/DATABASE.md) or deploy to Render/Railway
 *    with a persistent disk.
 */
const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/**": ["./src/lib/db/schema.sql"],
  },
};

// On read-only filesystems (Vercel serverless), keep SQLite writable in /tmp.
if (process.env.VERCEL && !process.env.MEDSAFE_DB_PATH) {
  process.env.MEDSAFE_DB_PATH = "/tmp/medsafe.db";
}
export default nextConfig;
