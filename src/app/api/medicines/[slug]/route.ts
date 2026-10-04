import { NextResponse } from "next/server";
import { getDb, jsonArray } from "@/lib/db";
import { getServerLang } from "@/lib/i18n/server";
import { analyzeMedicine, getMedicineIngredients } from "@/lib/safety-engine";

/**
 * GET /api/medicines/[slug] — Medicine details API (structured contract).
 *
 * Success:
 * { success: true, medicine: {
 *     id, slug, brandName, genericName, activeIngredients: [{name, strength}],
 *     manufacturer, category, form, strength, uses: [], sideEffects: [],
 *     warnings: [], interactions: [], pregnancyWarning, breastfeedingWarning,
 *     prescriptionStatus, source: {title, publisher, url}, lastUpdated,
 *     verification: {status, recordKind, dataConfidence, verifiedBy, notes},
 *     matchStatus: "verified"|"unverified" info label
 * }, safety: {...} }
 *
 * Not found: { success: false, code: "MEDICINE_NOT_FOUND", message } (HTTP 404)
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = getDb();
  const lang = await getServerLang();

  const med = db
    .prepare(
      `SELECT m.*, s.title AS source_title, s.publisher AS source_publisher, s.url AS source_url,
              s.document_name, s.publication_date, s.verification_status AS source_verification_status
       FROM medicines m LEFT JOIN sources s ON s.id = m.source_id WHERE m.slug = ?`
    )
    .get(slug) as Record<string, unknown> | undefined;

  if (!med) {
    return NextResponse.json(
      { success: false, code: "MEDICINE_NOT_FOUND", message: "No verified medicine record was found." },
      { status: 404 }
    );
  }

  const analysis = analyzeMedicine(med as never, {
    expiryDate: med.pack_expiry_hint as string | null,
    lang,
  });

  const ingredients = getMedicineIngredients(med.id as number);
  const interactions = db
    .prepare(
      `SELECT ai.name AS ingredientA, ai2.name AS ingredientB, i.severity, i.interaction_type AS type, i.description
       FROM interactions i
       JOIN active_ingredients ai ON ai.id = i.ingredient_a
       JOIN active_ingredients ai2 ON ai2.id = i.ingredient_b
       WHERE i.ingredient_a IN (SELECT ingredient_id FROM medicine_ingredients WHERE medicine_id = ?)
          OR i.ingredient_b IN (SELECT ingredient_id FROM medicine_ingredients WHERE medicine_id = ?)`
    )
    .all(med.id as number, med.id as number) as Array<{
      ingredientA: string; ingredientB: string; severity: string; type: string | null; description: string;
    }>;

  const medicine = {
    // ── structured camelCase contract ──
    id: med.id,
    slug: med.slug,
    brandName: med.brand_name,
    genericName: med.generic_name,
    activeIngredients: ingredients.map((i) => ({ name: i.name, strength: i.strength })),
    manufacturer: med.manufacturer,
    category: med.category,
    form: med.form,
    strength: med.strength,
    sideEffects: jsonArray(med.side_effects),
    warnings: analysis.cards.map((c) => ({ level: c.level, title: c.title, body: c.body })),
    interactions,
    pregnancyWarning: med.pregnancy_caution ? "Ask a doctor before use if pregnant or planning pregnancy." : null,
    breastfeedingWarning: med.breastfeeding_caution ? "Check with a doctor or pharmacist before use while breastfeeding." : null,
    prescriptionStatus: med.rx_required ? "Prescription required" : (med.schedule_class ?? "Not recorded"),
    source: {
      title: med.source_title ?? null,
      publisher: med.source_publisher ?? null,
      url: med.source_url ?? null,
      documentName: med.document_name ?? null,
      publicationDate: med.publication_date ?? null,
      verificationStatus: med.source_verification_status ?? null,
    },
    lastUpdated: med.last_updated,
    // ── legacy snake_case fields (existing consumers keep working) ──
    ...med,
    uses: jsonArray(med.uses),
    precautions: jsonArray(med.precautions),
    side_effects: jsonArray(med.side_effects),
    contraindications: jsonArray(med.contraindications),
    ingredients,
    verification: {
      status: med.verification,
      record_kind: med.record_kind,
      data_confidence: med.data_confidence,
      notes: med.verification_notes ?? null,
      verified_by: med.verified_by ?? null,
      last_updated: med.last_updated,
    },
  };

  return NextResponse.json({
    success: true,
    medicine,
    safety: analysis,
  });
}
