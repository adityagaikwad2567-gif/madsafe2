import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { flushSnapshot } from "@/lib/db/persistence";
import { getCurrentUser } from "@/lib/auth";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const status = new URL(req.url).searchParams.get("status");
  const db = getDb();
  const rows = status && ["open", "reviewing", "resolved"].includes(status)
    ? db.prepare("SELECT * FROM reports WHERE status = ? ORDER BY created_at DESC LIMIT 200").all(status)
    : db.prepare("SELECT * FROM reports ORDER BY created_at DESC LIMIT 200").all();
  return NextResponse.json({ reports: rows });
}

const Body = z.object({
  id: z.number().int().positive(),
  status: z.enum(["open", "reviewing", "resolved"]).optional(),
  admin_notes: z.string().max(2000).optional(),
});

export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid report update." }, { status: 400 });

  const db = getDb();
  const sets: string[] = [];
  const args: unknown[] = [];
  if (parsed.data.status) { sets.push("status = ?"); args.push(parsed.data.status); }
  if (parsed.data.admin_notes !== undefined) { sets.push("admin_notes = ?"); args.push(parsed.data.admin_notes); }
  if (sets.length === 0) return NextResponse.json({ ok: true });
  sets.push("updated_at = datetime('now')");
  args.push(parsed.data.id);
  db.prepare(`UPDATE reports SET ${sets.join(", ")} WHERE id = ?`).run(...(args as never[]));
  flushSnapshot();
  return NextResponse.json({ ok: true });
}
