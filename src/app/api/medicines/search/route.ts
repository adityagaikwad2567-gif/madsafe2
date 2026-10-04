import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { matchMedicines, type ScoredMatch } from "@/lib/medicine-matching";

/** Public shape for a search hit — internal normalized index fields are stripped. */
function publicHit(m: ScoredMatch) {
  const { nameNorm: _n, brandNorm: _b, genericNorm: _g, ingredientsNorm: _i, ...pub } = m.medicine as unknown as Record<string, unknown>;
  void _n; void _b; void _g; void _i;
  return { ...pub, matchScore: m.score, matchMethod: m.method };
}

/**
 * GET /api/medicines/search?q= — dedicated normalized search endpoint.
 *
 * Same engine as GET /api/medicines?q= (normalization, strength variants,
 * OCR misspellings, fuzzy matching) with the strict structured contract:
 *
 *   { success: true,  count, query, normalizedQuery, matchQuality, medicines: [...] }
 *   { success: false, code: "MEDICINE_NOT_FOUND", message, medicines: [] }
 */
export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ success: false, code: "BAD_REQUEST", message: "Query parameter q is required." }, { status: 400 });
  }

  const result = matchMedicines(q, { limit: 10 });

  if (result.status === "not_found") {
    return NextResponse.json({
      success: false,
      code: "MEDICINE_NOT_FOUND",
      message: "No verified medicine record was found for this search.",
      query: q,
      normalizedQuery: result.normalizedQuery,
      medicines: [],
    });
  }

  const medicines = result.matches.map(publicHit);

  return NextResponse.json({
    success: true,
    count: medicines.length,
    query: q,
    normalizedQuery: result.normalizedQuery,
    matchQuality: result.status, // "identified" | "ambiguous" (ambiguous = user should pick)
    topScore: result.topScore,
    medicines,
  });
}
