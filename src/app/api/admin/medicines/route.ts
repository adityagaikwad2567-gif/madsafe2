import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, jsonArray } from "@/lib/db";
import { flushSnapshot } from "@/lib/db/persistence";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin medicine management API.
 * Guard: every handler re-checks the session role server-side.
 */

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

function audit(actor: string, action: string, entityId: string | null, details: unknown) {
  getDb()
    .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)")
    .run(actor, action, "medicine", entityId, JSON.stringify(details));
}

const listShape = z.object({
  q: z.string().max(120).optional(),
  verification: z.enum(["verified", "unverified", "all"]).optional(),
});

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const sp = new URL(req.url).searchParams;
  const parsed = listShape.safeParse({ q: sp.get("q") ?? undefined, verification: sp.get("verification") ?? "all" });
  const q = `%${parsed.success && parsed.data.q ? parsed.data.q : ""}%`;
  const verification = parsed.success ? parsed.data.verification ?? "all" : "all";

  const where: string[] = ["(m.name LIKE ? OR m.brand_name LIKE ? OR m.generic_name LIKE ?)"];
  const args: unknown[] = [q, q, q];
  if (verification !== "all") {
    where.push("m.verification = ?");
    args.push(verification);
  }

  const rows = db
    .prepare(
      `SELECT m.id, m.slug, m.name, m.brand_name, m.generic_name, m.category, m.verification, m.verified_by,
              m.last_updated, m.rx_required, m.drowsiness,
              (SELECT GROUP_CONCAT(ai.name, ' + ') FROM medicine_ingredients mi
                JOIN active_ingredients ai ON ai.id = mi.ingredient_id WHERE mi.medicine_id = m.id) AS ingredients
       FROM medicines m WHERE ${where.join(" AND ")} ORDER BY m.name LIMIT 100`
    )
    .all(...(args as never[]));
  return NextResponse.json({ medicines: rows });
}

const upsert = z.object({
  id: z.number().int().optional(),
  slug: z.string().min(2).max(80).regex(/^[a-z0-9-]+$/),
  name: z.string().min(2).max(120),
  brand_name: z.string().max(120).optional().nullable(),
  generic_name: z.string().max(160).optional().nullable(),
  form: z.string().max(40).optional().nullable(),
  strength: z.string().max(80).optional().nullable(),
  manufacturer: z.string().max(120).optional().nullable(),
  category: z.string().max(80).optional().nullable(),
  barcode: z.string().max(32).optional().nullable(),
  schedule_class: z.string().max(80).optional().nullable(),
  rx_required: z.boolean().optional(),
  uses: z.array(z.string().max(300)).max(12).optional(),
  precautions: z.array(z.string().max(300)).max(12).optional(),
  side_effects: z.array(z.string().max(200)).max(15).optional(),
  storage: z.string().max(300).optional().nullable(),
  pack_expiry_hint: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  drowsiness: z.boolean().optional(),
  driving_warning: z.boolean().optional(),
  pregnancy_caution: z.boolean().optional(),
  breastfeeding_caution: z.boolean().optional(),
  menstrual_note: z.string().max(600).optional().nullable(),
  cycle_tags: z.array(z.enum(["menstrual", "hormonal", "delay"])).optional(),
  source_id: z.number().int().optional().nullable(),
  verification: z.enum(["verified", "unverified"]).optional(),
});

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = upsert.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid medicine fields.", detail: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = parsed.data;
  const db = getDb();
  const J = (a?: string[]) => JSON.stringify(a ?? []);

  if (d.id) {
    db.prepare(
      `UPDATE medicines SET slug=?, name=?, brand_name=?, generic_name=?, form=?, strength=?, manufacturer=?,
        category=?, barcode=?, schedule_class=?, rx_required=?, uses=?, precautions=?, side_effects=?, storage=?,
        pack_expiry_hint=?, drowsiness=?, driving_warning=?, pregnancy_caution=?, breastfeeding_caution=?,
        menstrual_note=?, cycle_tags=?, verification=?, verified_by=?, last_updated=datetime('now') WHERE id=?`
    ).run(
      d.slug, d.name, d.brand_name ?? null, d.generic_name ?? null, d.form ?? null, d.strength ?? null,
      d.manufacturer ?? null, d.category ?? null, d.barcode ?? null, d.schedule_class ?? null,
      d.rx_required ? 1 : 0, J(d.uses), J(d.precautions), J(d.side_effects), d.storage ?? null,
      d.pack_expiry_hint ?? null, d.drowsiness ? 1 : 0, d.driving_warning ? 1 : 0,
      d.pregnancy_caution ? 1 : 0, d.breastfeeding_caution ? 1 : 0, d.menstrual_note ?? null,
      JSON.stringify(d.cycle_tags ?? []), d.verification ?? "unverified",
      d.verification === "verified" ? admin.name : null, d.id
    );
    audit(admin.email, "medicine.update", String(d.id), { name: d.name, verification: d.verification ?? "unverified" });
    flushSnapshot();
    return NextResponse.json({ ok: true, id: d.id });
  }

  const info = db.prepare(
    `INSERT INTO medicines (slug, name, brand_name, generic_name, form, strength, manufacturer, category, barcode,
      schedule_class, rx_required, uses, precautions, side_effects, storage, pack_expiry_hint, drowsiness,
      driving_warning, pregnancy_caution, breastfeeding_caution, menstrual_note, cycle_tags, verification, verified_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    d.slug, d.name, d.brand_name ?? null, d.generic_name ?? null, d.form ?? null, d.strength ?? null,
    d.manufacturer ?? null, d.category ?? null, d.barcode ?? null, d.schedule_class ?? null,
    d.rx_required ? 1 : 0, J(d.uses), J(d.precautions), J(d.side_effects), d.storage ?? null,
    d.pack_expiry_hint ?? null, d.drowsiness ? 1 : 0, d.driving_warning ? 1 : 0,
    d.pregnancy_caution ? 1 : 0, d.breastfeeding_caution ? 1 : 0, d.menstrual_note ?? null,
    JSON.stringify(d.cycle_tags ?? []), d.verification ?? "unverified",
    d.verification === "verified" ? admin.name : null
  );
  const newId = Number(info.lastInsertRowid);
  audit(admin.email, "medicine.create", String(newId), { name: d.name, verification: d.verification ?? "unverified" });
  flushSnapshot();
  return NextResponse.json({ ok: true, id: newId });
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id required." }, { status: 400 });
  const db = getDb();
  try {
    db.prepare("DELETE FROM medicines WHERE id = ?").run(id);
  } catch {
    return NextResponse.json({ error: "Cannot delete: this medicine is referenced by cabinet or history entries." }, { status: 409 });
  }
  audit(admin.email, "medicine.delete", String(id), {});
  flushSnapshot();
  return NextResponse.json({ ok: true });
}
