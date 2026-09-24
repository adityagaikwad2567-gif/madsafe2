import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { flushSnapshot } from "@/lib/db/persistence";
import { getCurrentUser } from "@/lib/auth";

/**
 * Admin data-governance API.
 *
 * GET  /api/admin/data?entity=sources|ingredients|interactions|audit
 * POST /api/admin/data   { entity, ...fields }        — create
 * PATCH /api/admin/data  { entity, id, ...fields }    — update
 * DELETE /api/admin/data?entity=&id=                  — delete
 *
 * Every mutation writes an audit_log entry.
 */

const ENTITIES = ["sources", "ingredients", "interactions", "audit"] as const;
type Entity = (typeof ENTITIES)[number];

async function guard() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

function audit(actor: string, action: string, entity: string, entityId: string | null, details: unknown) {
  getDb()
    .prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)")
    .run(actor, action, entity, entityId, JSON.stringify(details));
}

export async function GET(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const entity = new URL(req.url).searchParams.get("entity") as Entity | null;

  switch (entity) {
    case "sources":
      return NextResponse.json({
        sources: db.prepare(
          `SELECT s.*, (SELECT COUNT(*) FROM medicines m WHERE m.source_id = s.id) AS medicine_count
           FROM sources s ORDER BY s.title`
        ).all(),
      });
    case "ingredients":
      return NextResponse.json({
        ingredients: db.prepare(
          `SELECT a.*, (SELECT COUNT(*) FROM medicine_ingredients mi WHERE mi.ingredient_id = a.id) AS medicine_count
           FROM active_ingredients a ORDER BY a.name`
        ).all(),
      });
    case "interactions":
      return NextResponse.json({
        interactions: db.prepare(
          `SELECT i.*, a1.name AS name_a, a2.name AS name_b, s.title AS source_title
           FROM interactions i
           JOIN active_ingredients a1 ON a1.id = i.ingredient_a
           JOIN active_ingredients a2 ON a2.id = i.ingredient_b
           LEFT JOIN sources s ON s.id = i.source_id
           ORDER BY i.id DESC LIMIT 200`
        ).all(),
      });
    case "audit":
      return NextResponse.json({
        audit: db.prepare("SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT 100").all(),
        imports: db.prepare("SELECT * FROM import_history ORDER BY created_at DESC, id DESC LIMIT 25").all(),
      });
    default:
      return NextResponse.json({ error: "entity must be sources|ingredients|interactions|audit" }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const entity = body.entity as Entity;

  if (entity === "sources") {
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "Source title is required." }, { status: 400 });
    const url = String(body.url ?? "").trim() || null;
    const doc = String(body.document_name ?? "").trim() || null;
    if (!url && !doc) return NextResponse.json({ error: "A source needs a URL or a document reference." }, { status: 400 });
    const r = db.prepare(
      `INSERT INTO sources (title, publisher, url, kind, document_name, publication_date, last_checked, verification_status, updated_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
    ).run(title, String(body.publisher ?? "").trim() || null, url,
      ["label", "guideline", "literature", "internal"].includes(String(body.kind)) ? String(body.kind) : "label",
      doc, String(body.publication_date ?? "").trim() || null,
      String(body.last_checked ?? "").trim() || new Date().toISOString().slice(0, 10),
      ["verified", "pending", "rejected"].includes(String(body.verification_status)) ? String(body.verification_status) : "pending");
    audit(user.email, "source.create", "source", String(r.lastInsertRowid), { title });
    flushSnapshot();
    return NextResponse.json({ ok: true, id: r.lastInsertRowid });
  }

  if (entity === "ingredients") {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Ingredient name is required." }, { status: 400 });
    const uniq = String(body.uniq_name ?? "").trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const dup = db.prepare("SELECT id FROM active_ingredients WHERE uniq_name = ?").get(uniq);
    if (dup) return NextResponse.json({ error: "An ingredient with that key already exists." }, { status: 409 });
    const r = db.prepare(
      "INSERT INTO active_ingredients (name, name_hi, name_mr, description, uniq_name) VALUES (?,?,?,?,?)"
    ).run(name, String(body.name_hi ?? "").trim() || null, String(body.name_mr ?? "").trim() || null,
      String(body.description ?? "").trim() || null, uniq);
    audit(user.email, "ingredient.create", "ingredient", String(r.lastInsertRowid), { name });
    flushSnapshot();
    return NextResponse.json({ ok: true, id: r.lastInsertRowid });
  }

  if (entity === "interactions") {
    const a = Number(body.ingredient_a), b = Number(body.ingredient_b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a <= 0 || b <= 0 || a === b) {
      return NextResponse.json({ error: "ingredient_a and ingredient_b must be two different ingredient ids." }, { status: 400 });
    }
    const description = String(body.description ?? "").trim();
    const sourceId = Number(body.source_id);
    if (!description) return NextResponse.json({ error: "Interaction description is required." }, { status: 400 });
    if (!Number.isInteger(sourceId) || sourceId <= 0 || !db.prepare("SELECT id FROM sources WHERE id = ?").get(sourceId)) {
      return NextResponse.json({ error: "A valid source_id is required — interactions must cite a source." }, { status: 400 });
    }
    const [x, y] = a < b ? [a, b] : [b, a];
    const severity = ["caution", "orange", "red"].includes(String(body.severity)) ? String(body.severity) : "caution";
    const dup = db.prepare("SELECT id FROM interactions WHERE ingredient_a = ? AND ingredient_b = ?").get(x, y);
    if (dup) return NextResponse.json({ error: "That ingredient pair already has an interaction record." }, { status: 409 });
    const r = db.prepare(
      "INSERT INTO interactions (ingredient_a, ingredient_b, severity, interaction_type, description, source_id) VALUES (?,?,?,?,?,?)"
    ).run(x, y, severity, String(body.interaction_type ?? "").trim() || null, description, sourceId);
    audit(user.email, "interaction.create", "interaction", String(r.lastInsertRowid), { a: x, b: y, severity });
    flushSnapshot();
    return NextResponse.json({ ok: true, id: r.lastInsertRowid });
  }

  return NextResponse.json({ error: "entity must be sources|ingredients|interactions" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const entity = body.entity as Entity;
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id is required." }, { status: 400 });

  if (entity === "sources") {
    const row = db.prepare("SELECT * FROM sources WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: "Source not found." }, { status: 404 });
    const patch = body as Partial<{ title: string; publisher: string; url: string; document_name: string; publication_date: string; last_checked: string; verification_status: string; kind: string }>;
    const vs = patch.verification_status;
    if (vs && !["verified", "pending", "rejected"].includes(vs)) {
      return NextResponse.json({ error: "verification_status must be verified|pending|rejected." }, { status: 400 });
    }
    db.prepare(
      `UPDATE sources SET
         title = ifnull(?, title), publisher = ifnull(?, publisher), url = ifnull(?, url),
         kind = ifnull(?, kind), document_name = ifnull(?, document_name),
         publication_date = ifnull(?, publication_date), last_checked = ifnull(?, last_checked),
         verification_status = ifnull(?, verification_status), updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      patch.title?.trim() || null, patch.publisher?.trim() || null, patch.url?.trim() || null,
      ["label", "guideline", "literature", "internal"].includes(patch.kind ?? "") ? patch.kind! : null,
      patch.document_name?.trim() || null, patch.publication_date?.trim() || null,
      patch.last_checked?.trim() || null, vs ?? null, id
    );
    audit(user.email, "source.update", "source", String(id), patch);
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }

  if (entity === "ingredients") {
    const patch = body as Partial<{ name: string; name_hi: string; name_mr: string; description: string }>;
    db.prepare(
      `UPDATE active_ingredients SET name = ifnull(?, name), name_hi = ifnull(?, name_hi),
       name_mr = ifnull(?, name_mr), description = ifnull(?, description) WHERE id = ?`
    ).run(patch.name?.trim() || null, patch.name_hi?.trim() || null, patch.name_mr?.trim() || null,
      patch.description?.trim() || null, id);
    audit(user.email, "ingredient.update", "ingredient", String(id), patch);
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }

  if (entity === "interactions") {
    const patch = body as Partial<{ severity: string; interaction_type: string; description: string }>;
    if (patch.severity && !["caution", "orange", "red"].includes(patch.severity)) {
      return NextResponse.json({ error: "severity must be caution|orange|red." }, { status: 400 });
    }
    db.prepare(
      `UPDATE interactions SET severity = ifnull(?, severity), interaction_type = ifnull(?, interaction_type),
       description = ifnull(?, description) WHERE id = ?`
    ).run(patch.severity ?? null, patch.interaction_type?.trim() || null, patch.description?.trim() || null, id);
    audit(user.email, "interaction.update", "interaction", String(id), patch);
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "entity must be sources|ingredients|interactions" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const sp = new URL(req.url).searchParams;
  const entity = sp.get("entity") as Entity | null;
  const id = Number(sp.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id is required." }, { status: 400 });

  if (entity === "sources") {
    const used = db.prepare("SELECT COUNT(*) AS c FROM medicines WHERE source_id = ?").get(id) as { c: number };
    if (used.c > 0) {
      return NextResponse.json({ error: `This source is cited by ${used.c} medicine record(s). Reassign them first.` }, { status: 409 });
    }
    db.prepare("DELETE FROM sources WHERE id = ?").run(id);
    audit(user.email, "source.delete", "source", String(id), {});
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }
  if (entity === "ingredients") {
    const used = db.prepare("SELECT COUNT(*) AS c FROM medicine_ingredients WHERE ingredient_id = ?").get(id) as { c: number };
    if (used.c > 0) {
      return NextResponse.json({ error: `This ingredient is linked to ${used.c} medicine(s). Remove the links first.` }, { status: 409 });
    }
    db.prepare("DELETE FROM active_ingredients WHERE id = ?").run(id);
    audit(user.email, "ingredient.delete", "ingredient", String(id), {});
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }
  if (entity === "interactions") {
    db.prepare("DELETE FROM interactions WHERE id = ?").run(id);
    audit(user.email, "interaction.delete", "interaction", String(id), {});
    flushSnapshot();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "entity must be sources|ingredients|interactions" }, { status: 400 });
}
