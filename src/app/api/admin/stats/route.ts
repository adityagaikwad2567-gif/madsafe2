import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const top = db
    .prepare(
      `SELECT m.name, COALESCE(s.count, 0) AS count
       FROM medicines m LEFT JOIN search_stats s ON s.medicine_id = m.id
       ORDER BY COALESCE(s.count, 0) DESC, m.name LIMIT 6`
    )
    .all();

  return NextResponse.json({
    users: c("SELECT COUNT(*) AS c FROM users"),
    medicines: c("SELECT COUNT(*) AS c FROM medicines"),
    verifiedMedicines: c("SELECT COUNT(*) AS c FROM medicines WHERE verification = 'verified'"),
    scans: c("SELECT COUNT(*) AS c FROM scan_history"),
    redFlags: c("SELECT COUNT(*) AS c FROM warnings WHERE level IN ('orange','red')"),
    reports: c("SELECT COUNT(*) AS c FROM reports"),
    openReports: c("SELECT COUNT(*) AS c FROM reports WHERE status != 'resolved'"),
    topSearched: top,
  });
}
