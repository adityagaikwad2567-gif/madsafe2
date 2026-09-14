import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT h.id, h.method, h.query, h.confidence, h.matched, h.created_at, m.name AS medicine_name, m.slug
       FROM scan_history h LEFT JOIN medicines m ON m.id = h.medicine_id
       WHERE h.user_id = ? ORDER BY h.created_at DESC LIMIT 25`
    )
    .all(user.id);
  return NextResponse.json({ history: rows });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = getDb();
  db.prepare("DELETE FROM scan_history WHERE user_id = ?").run(user.id);
  return NextResponse.json({ ok: true });
}
