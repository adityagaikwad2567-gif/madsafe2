import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const Body = z.object({
  name: z.string().min(2).max(80).optional(),
  language: z.enum(["en", "hi", "mr"]).optional(),
  cycle_enabled: z.boolean().optional(),
  cycle_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  cycle_length: z.number().int().min(2).max(60).nullable().optional(),
  privacy: z.record(z.string(), z.unknown()).optional(),
});

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile fields." }, { status: 400 });

  const db = getDb();
  const d = parsed.data;
  const updates: string[] = [];
  const values: unknown[] = [];

  if (d.name !== undefined) { updates.push("name = ?"); values.push(d.name.trim()); }
  if (d.language !== undefined) { updates.push("language = ?"); values.push(d.language); }
  if (d.cycle_enabled !== undefined) { updates.push("cycle_enabled = ?"); values.push(d.cycle_enabled ? 1 : 0); }
  if (d.cycle_start !== undefined) { updates.push("cycle_start = ?"); values.push(d.cycle_start); }
  if (d.cycle_length !== undefined) { updates.push("cycle_length = ?"); values.push(d.cycle_length); }
  if (d.privacy !== undefined) { updates.push("privacy = ?"); values.push(JSON.stringify(d.privacy)); }

  if (updates.length === 0) return NextResponse.json({ ok: true });

  values.push(user.id);
  db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).run(...(values as never[]));

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  // Right to deletion: remove the account and cascade personal data.
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  return NextResponse.json({ ok: true, deleted: true });
}
