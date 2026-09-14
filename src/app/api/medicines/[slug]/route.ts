import { NextResponse } from "next/server";
import { getDb, jsonArray } from "@/lib/db";
import { getServerLang } from "@/lib/i18n/server";
import { analyzeMedicine, getMedicineIngredients } from "@/lib/safety-engine";

/**
 * GET /api/medicines/[slug] — Medicine details API.
 *
 * Returns the full structured record + source/verification metadata and the
 * deterministic safety cards. Missing facts are returned as null — the UI
 * renders "Information not available in the verified database." for those.
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

  if (!med) return NextResponse.json({ error: "Medicine not found." }, { status: 404 });

  const analysis = analyzeMedicine(med as never, {
    expiryDate: med.pack_expiry_hint as string | null,
    lang,
  });

  return NextResponse.json({
    medicine: {
      ...med,
      uses: jsonArray(med.uses),
      precautions: jsonArray(med.precautions),
      side_effects: jsonArray(med.side_effects),
      contraindications: jsonArray(med.contraindications),
      ingredients: getMedicineIngredients((med.id as number)),
      source: {
        title: med.source_title ?? null,
        publisher: med.source_publisher ?? null,
        url: med.source_url ?? null,
        document_name: med.document_name ?? null,
        publication_date: med.publication_date ?? null,
        verification_status: med.source_verification_status ?? null,
      },
      verification: {
        status: med.verification,
        record_kind: med.record_kind,
        data_confidence: med.data_confidence,
        notes: med.verification_notes ?? null,
        verified_by: med.verified_by ?? null,
        last_updated: med.last_updated,
      },
    },
    safety: analysis,
  });
}
