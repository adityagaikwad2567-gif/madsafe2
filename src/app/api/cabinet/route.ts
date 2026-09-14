import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, jsonArray } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getServerLang } from "@/lib/i18n/server";
import { analyzeMedicine, crossMedicineChecks, expiryStatus, getMedicineIngredients, type IngredientRow } from "@/lib/safety-engine";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT um.id AS um_id, um.batch_no, um.expiry_date, um.pack_size, um.notes, um.added_at, m.*
       FROM user_medicines um JOIN medicines m ON m.id = um.medicine_id
       WHERE um.user_id = ? ORDER BY um.added_at DESC`
    )
    .all(user.id) as Array<Record<string, unknown> & { um_id: number; expiry_date: string | null }>;

  const lang = await getServerLang();
  const allIngredients = rows.map((r) => ({
    umId: r.um_id as number,
    ings: getMedicineIngredients(r.id as number),
  }));

  const items = rows.map((r, idx) => {
    const ings = allIngredients[idx].ings;
    const others = allIngredients.filter((x) => x.umId !== r.um_id).flatMap((x) => x.ings);
    const analysis = analyzeMedicine(r as never, { expiryDate: r.expiry_date, lang });
    const cross = crossMedicineChecks(ings, others, lang);
    return {
      umId: r.um_id,
      medicine: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        brand_name: r.brand_name,
        form: r.form,
        strength: r.strength,
        manufacturer: r.manufacturer,
        verification: r.verification,
      },
      ingredients: ings,
      expiry: expiryStatus(r.expiry_date ?? (r.pack_expiry_hint as string | null)),
      warnings: [...analysis.cards, ...cross.warnings],
      duplicates: cross.duplicates,
      reminders: db
        .prepare("SELECT id, time_of_day, label, active FROM reminders WHERE user_medicine_id = ? ORDER BY time_of_day")
        .all(r.um_id),
    };
  });

  return NextResponse.json({ items });
}

const AddBody = z.object({
  slug: z.string().min(1),
  expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  batch_no: z.string().max(40).optional(),
  pack_size: z.string().max(40).optional(),
  notes: z.string().max(200).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = AddBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid cabinet item." }, { status: 400 });

  const db = getDb();
  const med = db.prepare("SELECT id, pack_expiry_hint FROM medicines WHERE slug = ?").get(parsed.data.slug) as
    | { id: number; pack_expiry_hint: string | null }
    | undefined;
  if (!med) return NextResponse.json({ error: "Medicine not found." }, { status: 404 });

  // Demo convenience: if no date given, adopt the sample pack expiry so the expiry flow is testable.
  const expiry = parsed.data.expiry_date ?? med.pack_expiry_hint ?? null;
  const info = db
    .prepare(
      "INSERT INTO user_medicines (user_id, medicine_id, expiry_date, batch_no, pack_size, notes) VALUES (?,?,?,?,?,?)"
    )
    .run(user.id, med.id, expiry, parsed.data.batch_no ?? null, parsed.data.pack_size ?? null, parsed.data.notes ?? null);

  return NextResponse.json({ ok: true, umId: Number(info.lastInsertRowid) });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  const umId = Number(new URL(req.url).searchParams.get("umId"));
  if (!umId) return NextResponse.json({ error: "umId required." }, { status: 400 });
  const db = getDb();
  const row = db
    .prepare("SELECT id FROM user_medicines WHERE id = ? AND user_id = ?")
    .get(umId, user.id) as { id: number } | undefined;
  if (!row) return NextResponse.json({ error: "Item not found in your cabinet." }, { status: 404 });
  db.prepare("DELETE FROM user_medicines WHERE id = ?").run(umId);
  return NextResponse.json({ ok: true });
}
