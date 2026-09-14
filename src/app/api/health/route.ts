import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/health — deployment health check.
 *
 * Returns service + database status without exposing secrets, schema details,
 * counts, or anything else a scanner could use. Always 200 while the process is
 * up; `database: "error"` in the payload signals a DB problem for monitors.
 *
 * The database also self-migrates and self-seeds on first access
 * (see src/lib/db/index.ts + seed.ts), so this endpoint doubles as a
 * "is the DB ready" probe after a fresh deploy.
 */
export function GET() {
  let database: "ok" | "error" = "ok";
  try {
    getDb().prepare("SELECT 1").get();
  } catch {
    database = "error";
  }
  return NextResponse.json({
    status: "ok",
    service: "medsafe",
    database,
    time: new Date().toISOString(),
  });
}
