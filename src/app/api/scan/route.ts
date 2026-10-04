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

  const db = getDb();

  // Privacy-friendly history: user_id stays NULL for anonymous scans; only method + query are kept.
  const medId = result.candidates[0]
    ? (db.prepare("SELECT id FROM medicines WHERE slug = ?").get(result.candidates[0].slug) as { id: number } | undefined)?.id ?? null
    : null;
  db.prepare(
    "INSERT INTO scan_history (user_id, medicine_id, method, query, confidence, matched) VALUES (?,?,?,?,?,?)"
  ).run(user?.id ?? null, medId, mode, query ?? barcode ?? null, result.confidence, result.status === "identified" ? 1 : 0);

  // Usage statistics (real counts only — seeded fake stats were purged).
  if (result.status === "identified" && medId) {
    db.prepare(
      `INSERT INTO search_stats (medicine_id, count) VALUES (?,1)
       ON CONFLICT(medicine_id) DO UPDATE SET count = count + 1`
    ).run(medId);
  }
  flushSnapshot();

  // Structured contract on top of the scanner payload:
  //   success / matchStatus / code / medicine / candidates / matchMethod
  const identified = result.status === "identified";
  return NextResponse.json({
    ...result, // legacy fields consumed by the scanner client (status, message, confidence, candidates, steps, ocrText)
    success: identified,
    matchStatus: result.status,
    matchMethod: result.method,
    code: identified
      ? undefined
      : result.status === "uncertain"
        ? "LOW_CONFIDENCE"
        : "MEDICINE_NOT_FOUND",
    medicineId: medId,
    message:
      result.status === "not_found" && mode === "barcode"
        ? result.message
        : result.message,
  });
}
