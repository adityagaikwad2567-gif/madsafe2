import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { crossMedicineChecks, getMedicineIngredients, type IngredientRow } from "@/lib/safety-engine";

/**
 * GET /api/medicines/[slug]/interactions?with=<other-slug>
 *
 * Deterministic interaction data from the interactions table ONLY — nothing
 * is invented. Two modes:
 *  - without `with`: interactions recorded for this medicine's ingredients.
 *  - with `with=<slug>`: cross-checks against that medicine (interaction
 *    pairs + duplicate active-ingredient detection, e.g. Cabinet checks).
 *
 * If no interaction data exists the response says so explicitly instead of
 * implying the combination is safe.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const withSlug = new URL(req.url).searchParams.get("with")?.trim() ?? "";
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

  const base = getMedicineIngredients(med.id) as IngredientRow[];

  if (withSlug) {
    const other = db.prepare("SELECT id, slug, name FROM medicines WHERE slug = ?").get(withSlug) as
      | { id: number; slug: string; name: string }
      | undefined;
    if (!other) {
      return NextResponse.json(
        { success: false, code: "MEDICINE_NOT_FOUND", message: "The second medicine was not found." },
        { status: 404 }
      );
    }
    const otherIngs = getMedicineIngredients(other.id) as IngredientRow[];
    const { duplicates, warnings } = crossMedicineChecks(base, otherIngs);
    return NextResponse.json({
      success: true,
      medicine: { slug: med.slug, name: med.name },
      with: { slug: other.slug, name: other.name },
      duplicateIngredients: duplicates.map((d) => d.name),
      interactions: warnings.filter((w) => w.code === "interaction"),
      duplicateWarnings: warnings.filter((w) => w.code === "duplicate"),
      note:
        warnings.length === 0
          ? "Interaction information is not available in the connected database for this combination. This does not mean the combination is safe — consult a doctor or pharmacist."
          : "Interaction information comes from the connected database only and is not medical advice.",
    });
  }

  const interactions = db
    .prepare(
      `SELECT ai.name AS ingredientA, ai2.name AS ingredientB, i.severity, i.interaction_type AS type, i.description
       FROM interactions i
       JOIN active_ingredients ai ON ai.id = i.ingredient_a
       JOIN active_ingredients ai2 ON ai2.id = i.ingredient_b
       WHERE i.ingredient_a IN (SELECT ingredient_id FROM medicine_ingredients WHERE medicine_id = ?)
          OR i.ingredient_b IN (SELECT ingredient_id FROM medicine_ingredients WHERE medicine_id = ?)`
    )
    .all(med.id, med.id) as Array<{ ingredientA: string; ingredientB: string; severity: string; type: string | null; description: string }>;

  return NextResponse.json({
    success: true,
    medicine: { slug: med.slug, name: med.name },
    interactions,
    note:
      interactions.length === 0
        ? "Interaction information is not available in the connected database for this medicine's ingredients. This does not mean there are no interactions — consult a doctor or pharmacist."
        : "Interaction information comes from the connected database only and is not medical advice.",
  });
}
