import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * Public search API.
 *
 * GET /api/medicines
 *   q          — free text across brand name, generic name, active ingredient, manufacturer, category
 *   ingredient — filter by active ingredient (partial match)
 *   manufacturer — filter by manufacturer (partial match)
 *   category   — filter by category (partial match)
 *   rx         — "1" prescription-only, "0" OTC, omitted = any
 *   tag        — CycleSafe tag: menstrual | hormonal | delay (legacy ?cycle=1 still supported)
 *   suggest=1  — lightweight suggestions for the search box (top 8)
 *   limit      — max rows (default 30, hard cap 50)
 *
 * Every result carries verification + record_kind so the UI can label
 * Verified / Demo / Unverified information honestly.
 */

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

  const WHERE: string[] = ["1=1"];
  const ARGS: unknown[] = [];

  if (suggest) {
    // Cheap suggestions: name/brand/generic/ingredient prefix-ish matches
    const like = `%${q}%`;
    const rows = db
      .prepare(
        `SELECT DISTINCT m.slug, m.name, m.brand_name, m.verification, m.record_kind
         FROM medicines m
         LEFT JOIN medicine_ingredients mi ON mi.medicine_id = m.id
         LEFT JOIN active_ingredients ai ON ai.id = mi.ingredient_id
         WHERE m.name LIKE ? OR m.brand_name LIKE ? OR m.generic_name LIKE ? OR ai.name LIKE ?
         ORDER BY CASE m.verification WHEN 'verified' THEN 0 ELSE 1 END, m.name
         LIMIT 8`
      )
      .all(like, like, like, like);
    return NextResponse.json({ suggestions: rows });
  }

  if (q) {
    const like = `%${q}%`;
    WHERE.push(
      `(m.name LIKE ? OR m.brand_name LIKE ? OR m.generic_name LIKE ? OR m.category LIKE ? OR m.manufacturer LIKE ? OR ai.name LIKE ?)`
    );
    ARGS.push(like, like, like, like, like, like);
  }
  if (ingredient) {
    WHERE.push("ai.name LIKE ?");
    ARGS.push(`%${ingredient}%`);
  }
  if (manufacturer) {
    WHERE.push("m.manufacturer LIKE ?");
    ARGS.push(`%${manufacturer}%`);
  }
  if (category) {
    WHERE.push("m.category LIKE ?");
    ARGS.push(`%${category}%`);
  }
  if (rx === "1" || rx === "0") {
    WHERE.push("m.rx_required = ?");
    ARGS.push(Number(rx));
  }
  const tagValue = tag || (legacyCycle === "1" ? (searchParams.get("tag") ?? "menstrual") : "");
  if (tagValue) {
    const safeTag = ["menstrual", "hormonal", "delay"].includes(tagValue) ? tagValue : "menstrual";
    WHERE.push(`m.cycle_tags LIKE ?`);
    ARGS.push(`%"${safeTag}"%`);
  }

  const rows = db
    .prepare(
      `SELECT DISTINCT m.slug, m.name, m.brand_name, m.generic_name, m.form, m.strength,
              m.manufacturer, m.category, m.verification, m.record_kind, m.rx_required,
              (SELECT GROUP_CONCAT(ai2.name, ' + ') FROM medicine_ingredients mi2
                JOIN active_ingredients ai2 ON ai2.id = mi2.ingredient_id WHERE mi2.medicine_id = m.id) AS ingredients
       FROM medicines m
       LEFT JOIN medicine_ingredients mi ON mi.medicine_id = m.id
       LEFT JOIN active_ingredients ai ON ai.id = mi.ingredient_id
       WHERE ${WHERE.join(" AND ")}
       ORDER BY CASE m.verification WHEN 'verified' THEN 0 ELSE 1 END, m.name
       LIMIT ?`
    )
    .all(...(ARGS as never[]), limit);

  // Distinct filter options for the UI
  const facets = db
    .prepare(
      `SELECT 'category' AS k, category AS v, COUNT(*) AS n FROM medicines WHERE category IS NOT NULL AND category != ''
       GROUP BY category
       UNION ALL
       SELECT 'manufacturer', manufacturer, COUNT(*) FROM medicines WHERE manufacturer IS NOT NULL AND manufacturer != ''
       GROUP BY manufacturer ORDER BY k, n DESC, v`
    )
    .all();

  return NextResponse.json({ medicines: rows, facets });
}
