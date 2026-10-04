import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, jsonArray } from "@/lib/db";
import { matchMedicines, normalizeMedicineText } from "@/lib/medicine-matching";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/medicines/identify — identify a medicine from raw input.
 *
 * Body: { query?: string, barcode?: string, ocrConfidence?: number (0..1) }
 *
 * Used after on-device OCR / barcode decode to map extracted text to the
 * verified database. Structured contract:
 *
 *   identified: { success:true, matchStatus:"identified", medicine:{...}, candidates:[...], matchMethod, matchScore }
 *   ambiguous : { success:true, matchStatus:"ambiguous", candidates:[...], message }  ← UI asks the user to pick
 *   low conf  : { success:false, code:"LOW_CONFIDENCE", message }  ← OCR was too unclear
 *   not found : { success:false, code:"MEDICINE_NOT_FOUND", message }
 */

const Body = z.object({
  query: z.string().max(2000).optional(),
  barcode: z.string().max(64).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
});

type MedRow = Record<string, unknown>;

function fullMedicine(id: number): MedRow | null {
  const db = getDb();
  const med = db
    .prepare(
      `SELECT m.id, m.slug, m.name, m.brand_name AS brandName, m.generic_name AS genericName,
              m.form, m.strength, m.manufacturer, m.category, m.rx_required AS prescriptionRequired,
              m.uses, m.precautions, m.side_effects AS sideEffects, m.storage, m.verification,
              m.data_confidence AS dataConfidence, m.last_updated AS lastUpdated,
              s.title AS sourceTitle, s.publisher AS sourcePublisher, s.url AS sourceUrl
       FROM medicines m LEFT JOIN sources s ON s.id = m.source_id WHERE m.id = ?`
    )
    .get(id) as MedRow | undefined;
  if (!med) return null;
  const db2 = getDb();
  const ingredients = db2
    .prepare(
      `SELECT ai.name, mi.strength FROM medicine_ingredients mi
       JOIN active_ingredients ai ON ai.id = mi.ingredient_id WHERE mi.medicine_id = ? ORDER BY ai.name`
    )
    .all(id) as Array<{ name: string; strength: string | null }>;
  return {
    ...med,
    uses: jsonArray(med.uses),
    precautions: jsonArray(med.precautions),
    sideEffects: jsonArray(med.sideEffects),
    activeIngredients: ingredients.map((i) => ({ name: i.name, strength: i.strength })),
    source: { title: med.sourceTitle, publisher: med.sourcePublisher, url: med.sourceUrl },
  };
}

export async function POST(req: Request) {
  const rl = rateLimit(`identify:${clientIp(req)}`, 30, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Provide query and/or barcode." }, { status: 400 });
  }
  const { query, barcode, ocrConfidence } = parsed.data;

  // ── Barcode path: exact mapping only, never claimed as authenticity proof ──
  if (barcode && barcode.trim()) {
    const db = getDb();
    const med = db.prepare("SELECT id, slug, name, brand_name, generic_name, manufacturer, strength, verification FROM medicines WHERE barcode = ?").get(barcode.trim()) as
      | (Record<string, unknown> & { id: number })
      | undefined;
    if (med) {
      return NextResponse.json({
        success: true,
        matchStatus: "identified",
        matchMethod: "barcode",
        matchScore: 0.97,
        medicine: fullMedicine(med.id),
        candidates: [med],
        message: "Barcode matched a verified medicine record.",
      });
    }
    return NextResponse.json({
      success: false,
      code: "MEDICINE_NOT_FOUND",
      message: "Barcode detected, but medicine information could not be verified from the available database. A barcode does not prove a medicine is genuine — use manual search.",
    });
  }

  // ── Text path (typed, OCR, voice) ──
  const raw = (query ?? "").trim();
  if (!raw) {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Provide query and/or barcode." }, { status: 400 });
  }

  const normalized = normalizeMedicineText(raw);
  // Very short/garbled input or clearly noisy OCR → refuse rather than guess.
  const meaningful = normalized.replace(/\b(mg|ml|tablet|capsule|syrup)\b/g, "").trim();
  const tooWeak = meaningful.length < 3;
  const noisyOcr = typeof ocrConfidence === "number" && ocrConfidence < 0.35;

  const result = matchMedicines(raw, { limit: 5 });

  if (result.status !== "not_found" && !tooWeak && !noisyOcr) {
    const top = result.matches[0];
    const candidates = result.matches.map((m) => {
      const { nameNorm: _n, brandNorm: _b, genericNorm: _g, ingredientsNorm: _i, ...pub } = m.medicine as unknown as Record<string, unknown>;
      void _n; void _b; void _g; void _i;
      return { ...pub, matchScore: m.score, matchMethod: m.method };
    });
    if (result.status === "ambiguous") {
      return NextResponse.json({
        success: true,
        matchStatus: "ambiguous",
        matchMethod: "text",
        topScore: top.score,
        normalizedQuery: normalized,
        candidates,
        message: "Several medicines match this text — please select the correct one.",
      });
    }
    return NextResponse.json({
      success: true,
      matchStatus: "identified",
      matchMethod: "text",
      matchScore: top.score,
      normalizedQuery: normalized,
      medicine: fullMedicine(top.medicine.id),
      candidates,
      message: `Matched against the ${top.medicine.verification} database record.`,
    });
  }

  const lowConfidence = noisyOcr || (result.status !== "not_found" && topConfidenceBelow(result, 0.6));
  return NextResponse.json({
    success: false,
    code: lowConfidence && !tooWeak ? "LOW_CONFIDENCE" : "MEDICINE_NOT_FOUND",
    message:
      lowConfidence && !tooWeak
        ? "Medicine name could not be identified confidently. Please retake a clearer image or search manually."
        : "No verified medicine record was found for this text. Check the spelling or search manually.",
    normalizedQuery: normalized,      candidates:
        result.status === "not_found"
          ? []
          : result.matches.map((m) => {
              const { nameNorm: _n, brandNorm: _b, genericNorm: _g, ingredientsNorm: _i, ...pub } = m.medicine as unknown as Record<string, unknown>;
              void _n; void _b; void _g; void _i;
              return { ...pub, matchScore: m.score, matchMethod: m.method };
            }),
  });
}

function topConfidenceBelow(result: { topScore: number }, threshold: number): boolean {
  return result.topScore < threshold;
}
