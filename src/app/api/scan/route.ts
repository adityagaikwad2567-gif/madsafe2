import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { flushSnapshot } from "@/lib/db/persistence";
import { getCurrentUser } from "@/lib/auth";
import { identifyByBarcode, identifyByText } from "@/lib/scan-pipeline";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const Body = z.object({
  mode: z.enum(["camera", "upload", "barcode", "manual", "voice"]),
  query: z.string().max(2000).optional(),
  barcode: z.string().max(64).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  const rl = rateLimit(`scan:${user?.id ?? clientIp(req)}`, 30, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid scan payload." }, { status: 400 });

  const { mode, query, barcode, ocrConfidence } = parsed.data;
  const result =
    mode === "barcode" && barcode
      ? identifyByBarcode(barcode)
      : identifyByText(query ?? "", mode, { ocrConfidence });

  // Privacy-friendly history: user_id stays NULL for anonymous scans; only method + query are kept.
  const db = getDb();
  db.prepare(
    "INSERT INTO scan_history (user_id, medicine_id, method, query, confidence, matched) VALUES (?,?,?,?,?,?)"
  )
    .run(
      user?.id ?? null,
      result.candidates[0] ? (db.prepare("SELECT id FROM medicines WHERE slug = ?").get(result.candidates[0].slug) as { id: number } | undefined)?.id ?? null : null,
      mode,
      query ?? barcode ?? null,
      result.confidence,
      result.status === "identified" ? 1 : 0
    );
  flushSnapshot();

  return NextResponse.json(result);
}
