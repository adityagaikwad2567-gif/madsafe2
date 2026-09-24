import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { flushSnapshot } from "@/lib/db/persistence";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const umId = Number(new URL(req.url).searchParams.get("umId"));
  if (!umId) return NextResponse.json({ error: "umId required." }, { status: 400 });
  const db = getDb();
  const owned = db
    .prepare("SELECT id FROM user_medicines WHERE id = ? AND user_id = ?")
    .get(umId, user.id);
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const reminders = db
    .prepare("SELECT id, time_of_day, label, active FROM reminders WHERE user_medicine_id = ? ORDER BY time_of_day")
    .all(umId);
  return NextResponse.json({ reminders });
}

const Body = z.object({
  umId: z.number().int().positive(),
  time_of_day: z.string().regex(/^\d{2}:\d{2}$/),
  label: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reminder." }, { status: 400 });

  const db = getDb();
  const owned = db
    .prepare("SELECT id FROM user_medicines WHERE id = ? AND user_id = ?")
    .get(parsed.data.umId, user.id);
  if (!owned) return NextResponse.json({ error: "Not found." }, { status: 404 });

  db.prepare("INSERT INTO reminders (user_id, user_medicine_id, time_of_day, label) VALUES (?,?,?,?)").run(
    user.id,
    parsed.data.umId,
    parsed.data.time_of_day,
    parsed.data.label ?? null
  );
  flushSnapshot();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const db = getDb();
  const row = db
    .prepare(
      `SELECT r.id FROM reminders r JOIN user_medicines um ON um.id = r.user_medicine_id
       WHERE r.id = ? AND r.user_id = ? AND um.user_id = ?`
    )
    .get(id, user.id, user.id);
  if (!row) return NextResponse.json({ error: "Not found." }, { status: 404 });
  db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
  flushSnapshot();
  return NextResponse.json({ ok: true });
}
