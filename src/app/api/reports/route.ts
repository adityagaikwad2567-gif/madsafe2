import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const REPORT_TYPES = ["expired", "damaged_packaging", "incorrect_label", "suspicious_sale", "info_mismatch"] as const;

const Body = z.object({
  type: z.enum(REPORT_TYPES),
  description: z.string().min(10).max(2000),
  medicine_name: z.string().max(120).optional(),
  pharmacy: z.string().max(120).optional(),
  location: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`reports:${clientIp(req)}`, 5, 3600);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please choose a report type and describe the issue (10+ characters)." }, { status: 400 });
  }

  const user = await getCurrentUser(); // optional — reports are anonymous by default
  const db = getDb();
  const info = db
    .prepare(
      "INSERT INTO reports (user_id, type, description, medicine_name, pharmacy, location) VALUES (?,?,?,?,?,?)"
    )
    .run(
      user?.id ?? null,
      parsed.data.type,
      parsed.data.description.trim(),
      parsed.data.medicine_name ?? null,
      parsed.data.pharmacy ?? null,
      parsed.data.location ?? null
    );

  return NextResponse.json({ ok: true, reportId: Number(info.lastInsertRowid) });
}

export async function GET() {
  // Returns only the reports attributed to the current account (if submitted while logged in).
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ reports: [] });
  const db = getDb();
  const rows = db
    .prepare("SELECT id, type, status, description, created_at, admin_notes FROM reports WHERE user_id = ? ORDER BY created_at DESC")
    .all(user.id);
  return NextResponse.json({ reports: rows });
}
