import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getServerLang } from "@/lib/i18n/server";
import { arIdentify } from "@/lib/ar-scene";

const Body = z.object({
  query: z.string().max(120).optional(),
  barcode: z.string().max(32).optional(),
  uncertain: z.boolean().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid AR payload." }, { status: 400 });

  const lang = await getServerLang();
  const result = arIdentify({ ...parsed.data, lang });

  // Privacy-friendly history: same policy as the scanner (query only, never images).
  const user = await getCurrentUser();
  const db = getDb();
  db.prepare(
    "INSERT INTO scan_history (user_id, medicine_id, method, query, confidence, matched) VALUES (?,?,?,?,?,?)"
  ).run(
    user?.id ?? null,
    result.feature
      ? (db.prepare("SELECT id FROM medicines WHERE slug = ?").get(result.feature.slug) as { id: number } | undefined)?.id ?? null
      : null,
    "camera",
    `AR: ${parsed.data.query ?? parsed.data.barcode ?? "frame"}`.slice(0, 180),
    result.confidence,
    result.status === "identified" ? 1 : 0
  );

  return NextResponse.json(result);
}
