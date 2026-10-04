import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/barcode — map a decoded barcode/QR value to a medicine record.
 *
 * The browser performs the REAL decoding (BarcodeDetector / ZXing); this
 * endpoint performs the database mapping. It never claims that a scanned
 * barcode proves authenticity — see the message when unmapped.
 */
const Body = z.object({ code: z.string().min(1).max(64) });

export async function POST(req: Request) {
  const rl = rateLimit(`barcode:${clientIp(req)}`, 30, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Field `code` is required." }, { status: 400 });
  }

  const db = getDb();
  const med = db
    .prepare(
      `SELECT id, slug, name, brand_name, generic_name, manufacturer, strength, form, verification
       FROM medicines WHERE barcode = ?`
    )
    .get(parsed.data.code.trim()) as Record<string, unknown> | undefined;

  if (med) {
    return NextResponse.json({ success: true, medicine: med });
  }
  return NextResponse.json({
    success: false,
    code: "MEDICINE_NOT_FOUND",
    message: "Barcode detected, but medicine information could not be verified from the available database. Try manual search — a barcode cannot prove a medicine is genuine.",
  });
}
