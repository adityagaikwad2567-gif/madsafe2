import { NextResponse } from "next/server";
import { z } from "zod";
import { matchMedicines, normalizeMedicineText } from "@/lib/medicine-matching";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * POST /api/ocr — process an OCR extraction result.
 *
 * MedSafe performs image OCR ON-DEVICE in the browser (tesseract.js — the
 * image never leaves the phone). This endpoint is the server-side half of
 * the OCR pipeline: it takes the recognized text, normalizes it (strength
 * spacing, dosage-form wording, common OCR misspellings) and returns the
 * matching database candidates.
 *
 * Body: { text: string, ocrConfidence?: number (0..1) }
 */
const Body = z.object({
  text: z.string().max(2000),
  ocrConfidence: z.number().min(0).max(1).optional(),
});

export async function POST(req: Request) {
  const rl = rateLimit(`ocr:${clientIp(req)}`, 30, 300);
  if (!rl.ok) return tooManyRequests(rl);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Field `text` is required." }, { status: 400 });
  }

  const { text, ocrConfidence } = parsed.data;
  const normalized = normalizeMedicineText(text);
  const result = matchMedicines(text, { limit: 5 });
  const stripIndexFields = (m: { medicine: Record<string, unknown>; score: number; method: string }) => {
    const { nameNorm: _n, brandNorm: _b, genericNorm: _g, ingredientsNorm: _i, ...pub } = m.medicine;
    void _n; void _b; void _g; void _i;
    return { ...pub, matchScore: m.score, matchMethod: m.method };
  };

  if (result.status === "not_found") {
    return NextResponse.json({
      success: false,
      code: "MEDICINE_NOT_FOUND",
      message: "No verified medicine record matches the recognized text. Retake a clearer photo or search manually.",
      recognizedText: text.trim().slice(0, 200),
      normalizedText: normalized,
    });
  }

  // Noisy OCR must never masquerade as a confident match.
  if (typeof ocrConfidence === "number" && ocrConfidence < 0.35) {
    return NextResponse.json({
      success: false,
      code: "LOW_CONFIDENCE",
      message: "Medicine name could not be identified confidently. Please retake a clearer image or search manually.",
      recognizedText: text.trim().slice(0, 200),
      normalizedText: normalized,
      ocrConfidence,
    });
  }

  const top = result.matches[0];
  return NextResponse.json({
    success: true,
    matchStatus: result.status, // "identified" | "ambiguous"
    normalizedText: normalized,
    ocrConfidence: ocrConfidence ?? null,
    candidates: result.matches.map(stripIndexFields),
    topScore: top.score,
  });
}
