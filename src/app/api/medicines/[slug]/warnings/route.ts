import { NextResponse } from "next/server";
import { getDb, jsonArray } from "@/lib/db";

/**
 * GET /api/medicines/[slug]/warnings
 *
 * All warning cards stored for this medicine, from the warnings table ONLY.
 * Missing data is returned as an empty list with an explicit note — never
 * filled with invented warnings.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = getDb();

  const med = db.prepare("SELECT id, slug, name FROM medicines WHERE slug = ?").get(slug) as
    | { id: number; slug: string; name: string }
    | undefined;
  if (!med) {
    return NextResponse.json(
      { success: false, code: "MEDICINE_NOT_FOUND", message: "No verified medicine record was found." },
      { status: 404 }
    );
  }

  const warnings = db
    .prepare("SELECT code, level, title, body FROM warnings WHERE medicine_id = ? ORDER BY id")
    .all(med.id) as Array<{ code: string; level: string; title: string; body: string }>;

  const med2 = db
    .prepare("SELECT precautions, contraindications, pregnancy_caution, breastfeeding_caution FROM medicines WHERE id = ?")
    .get(med.id) as
    | { precautions: string; contraindications: string; pregnancy_caution: number; breastfeeding_caution: number }
    | undefined;

  return NextResponse.json({
    success: true,
    medicine: { slug: med.slug, name: med.name },
    warnings,
    precautions: jsonArray(med2?.precautions),
    contraindications: jsonArray(med2?.contraindications),
    pregnancyCaution: Boolean(med2?.pregnancy_caution),
    breastfeedingCaution: Boolean(med2?.breastfeeding_caution),
    note:
      warnings.length === 0
        ? "No warning cards are recorded in the connected database for this medicine. This does not mean the medicine is safe — the safety indicator is for awareness only."
        : "Warnings come from the connected database only and are not medical advice.",
  });
}
