import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { matchMedicines, suggestMedicines, type ScoredMatch } from "@/lib/medicine-matching";

/**
 * Public search API.
 *
 * GET /api/medicines
 *   q            — free text across brand name, generic name, active ingredient,
 *                  manufacturer, category. Input is normalized (case, punctuation,
 *                  strength spacing "500mg"→"500 mg", common OCR misspellings,
 *                  dosage-form wording) before matching.
 *   ingredient / manufacturer / category / rx / tag — structured filters (legacy)
 *   suggest=1    — lightweight suggestions for search boxes (top 8)
 *   limit        — max rows (default 30, hard cap 50)
 *
 * Structured contract:
 *   { success: true,  count, medicines: [...], facets }
 *   { success: true,  count: 0, medicines: [], code: "MEDICINE_NOT_FOUND", message }
 * Every row carries verification + record_kind so the UI can label
 * Verified / Unverified information honestly.
 */

type Row = Record<string, unknown>;

/** Attach match metadata so the UI can show match method + confidence (internal index fields stripped). */
function toRow(r: ScoredMatch): Row {
  const { nameNorm: _n, brandNorm: _b, genericNorm: _g, ingredientsNorm: _i, ...pub } = r.medicine as unknown as Record<string, unknown>;
  void _n; void _b; void _g; void _i;
  return {
    ...pub,
    matchScore: r.score,
    matchMethod: r.method,
  };
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const ingredient = searchParams.get("ingredient")?.trim() ?? "";
  const manufacturer = searchParams.get("manufacturer")?.trim() ?? "";
  const category = searchParams.get("category")?.trim() ?? "";
  const rx = searchParams.get("rx")?.trim() ?? "";
  const tag = searchParams.get("tag")?.trim() ?? "";
  const legacyCycle = searchParams.get("cycle");
  const suggest = searchParams.get("suggest") === "1";
  const limit = Math.min(50, Number(searchParams.get("limit") ?? 30) || 30);

  if (suggest) {
    return NextResponse.json({ success: true, suggestions: suggestMedicines(q, 8) });
  }

  // ── Filters-only listing (no query): plain deterministic listing ──
  const hasFilters = Boolean(ingredient || manufacturer || category || rx || tag || legacyCycle === "1");

  if (!q) {
    const WHERE: string[] = ["1=1"];
    const ARGS: unknown[] = [];
    if (ingredient) { WHERE.push("ai.name LIKE ?"); ARGS.push(`%${ingredient}%`); }
    if (manufacturer) { WHERE.push("m.manufacturer LIKE ?"); ARGS.push(`%${manufacturer}%`); }
    if (category) { WHERE.push("m.category LIKE ?"); ARGS.push(`%${category}%`); }
    if (rx === "1" || rx === "0") { WHERE.push("m.rx_required = ?"); ARGS.push(Number(rx)); }
    const tagValue = tag || (legacyCycle === "1" ? "menstrual" : "");
    if (tagValue) {
      const safeTag = ["menstrual", "hormonal", "delay"].includes(tagValue) ? tagValue : "menstrual";
      WHERE.push(`m.cycle_tags LIKE ?`);
      ARGS.push(`%"${safeTag}"%`);
    }

    const rows = db
      .prepare(
        `SELECT DISTINCT m.id, m.slug, m.name, m.brand_name, m.generic_name, m.form, m.strength,
                m.manufacturer, m.category, m.verification, m.record_kind, m.rx_required,
                (SELECT GROUP_CONCAT(ai2.name, ' + ') FROM medicine_ingredients mi2
                  JOIN active_ingredients ai2 ON ai2.id = mi2.ingredient_id WHERE mi2.medicine_id = m.id) AS activeIngredients
         FROM medicines m
         LEFT JOIN medicine_ingredients mi ON mi.medicine_id = m.id
         LEFT JOIN active_ingredients ai ON ai.id = mi.ingredient_id
         WHERE ${WHERE.join(" AND ")}
         ORDER BY CASE m.verification WHEN 'verified' THEN 0 ELSE 1 END, m.name
         LIMIT ?`
      )
      .all(...(ARGS as never[]), limit) as Row[];

    return NextResponse.json({
      success: true,
      count: rows.length,
      medicines: rows,
      facets: buildFacets(db),
      ...(rows.length === 0 && hasFilters ? { code: "MEDICINE_NOT_FOUND", message: "No verified medicine record was found for these filters." } : {}),
    });
  }

  // ── Normalized + fuzzy matching for text queries ──
  const result = matchMedicines(q, { limit });

  if (result.status === "not_found") {
    // Fall back to substring search across every indexed column so partial
    // manufacturer/category strings still work (e.g. "micro labs").
    const like = `%${q}%`;
    const fallback = db
      .prepare(
        `SELECT DISTINCT m.id, m.slug, m.name, m.brand_name, m.generic_name, m.form, m.strength,
                m.manufacturer, m.category, m.verification, m.record_kind, m.rx_required, 0 AS matchScore,
                'partial' AS matchMethod,
                (SELECT GROUP_CONCAT(ai2.name, ' + ') FROM medicine_ingredients mi2
                  JOIN active_ingredients ai2 ON ai2.id = mi2.ingredient_id WHERE mi2.medicine_id = m.id) AS activeIngredients
         FROM medicines m
         LEFT JOIN medicine_ingredients mi ON mi.medicine_id = m.id
         LEFT JOIN active_ingredients ai ON ai.id = mi.ingredient_id
         WHERE m.name LIKE ? OR m.brand_name LIKE ? OR m.generic_name LIKE ? OR m.category LIKE ?
            OR m.manufacturer LIKE ? OR ai.name LIKE ? OR m.slug LIKE ?
         ORDER BY CASE m.verification WHEN 'verified' THEN 0 ELSE 1 END, m.name
         LIMIT ?`
      )
      .all(like, like, like, like, like, like, like, limit) as Row[];

    if (fallback.length === 0) {
      return NextResponse.json({
        success: false,
        code: "MEDICINE_NOT_FOUND",
        message: "No verified medicine record was found for this search. Check the spelling or import the record from the admin panel.",
        medicines: [],
        count: 0,
        facets: buildFacets(db),
      }, { status: 200 });
    }
    return NextResponse.json({
      success: true,
      count: fallback.length,
      medicines: fallback,
      facets: buildFacets(db),
      matchQuality: "partial",
    });
  }

  const medicines = result.matches.map(toRow);
  return NextResponse.json({
    success: true,
    count: medicines.length,
    medicines,
    facets: buildFacets(db),
    matchQuality: result.status, // "identified" | "ambiguous"
    normalizedQuery: result.normalizedQuery,
    topScore: result.topScore,
  });
}

function buildFacets(db: ReturnType<typeof getDb>) {
  return db
    .prepare(
      `SELECT 'category' AS k, category AS v, COUNT(*) AS n FROM medicines WHERE category IS NOT NULL AND category != ''
       GROUP BY category
       UNION ALL
       SELECT 'manufacturer', manufacturer, COUNT(*) FROM medicines WHERE manufacturer IS NOT NULL AND manufacturer != ''
       GROUP BY manufacturer ORDER BY k, n DESC, v`
    )
    .all();
}
