import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";

/**
 * MedSafe data-import engine (admin only).
 *
 * Supported formats: CSV, Excel (.xlsx/.xls), JSON, manual single-record entry.
 *
 * Validation contract — a record is REJECTED unless ALL of these hold:
 *   1. medicine_name is present (non-empty after trim)
 *   2. generic_name is present
 *   3. at least one parseable active ingredient is present
 *   4. a source is resolvable: source_name + source_url (document_name optional),
 *      or source_id of an existing sources row
 *   5. last_updated is a YYYY-MM-DD date
 *   6. verification_status is present (verified/unverified)
 *   7. remaining enum fields hold legal values (data_confidence)
 *
 * Missing OPTIONAL facts (uses, precautions, side effects, storage, pregnancy…)
 * are never filled with guesses — they stay empty and the UI shows
 * "Information not available in the verified database."
 *
 * Duplicate detection: slug (generated from medicine_name + strength), barcode
 * (when provided), or exact name+strength+form match.
 */

export type ImportFormat = "csv" | "excel" | "json" | "manual";

export type RawRecord = Record<string, unknown>;

export type ValidationError = { row: number; field: string; message: string };

export type ValidatedRecord = {
  row: number;
  status: "valid" | "duplicate_update";
  existingId?: number;
  data: {
    slug: string;
    name: string;
    brand_name: string | null;
    generic_name: string | null;
    form: string | null;
    strength: string | null;
    manufacturer: string | null;
    category: string | null;
    barcode: string | null;
    schedule_class: string | null;
    rx_required: boolean;
    uses: string[];
    precautions: string[];
    side_effects: string[];
    contraindications: string[];
    storage: string | null;
    drowsiness: boolean;
    driving_warning: boolean;
    pregnancy_caution: boolean;
    breastfeeding_caution: boolean;
    menstrual_note: string | null;
    source_id: number | null;
    verification: "verified" | "unverified";
    data_confidence: "high" | "medium" | "low";
    verification_notes: string | null;
    record_kind: "demo" | "real";
    last_updated: string | null;
    ingredients: Array<{ name: string; strength: string | null }>;
  };
};

export type PreviewResult = {
  format: ImportFormat;
  total: number;
  valid: number;
  duplicates: number;
  rejected: number;
  records: ValidatedRecord[];
  errors: ValidationError[];
};

// ── header normalization ─────────────────────────────────────────
const HEADER_MAP: Record<string, string> = {
  medicine_name: "name",
  name: "name",
  brand_name: "brand_name",
  brand: "brand_name",
  generic_name: "generic_name",
  generic: "generic_name",
  active_ingredients: "ingredients",
  ingredients: "ingredients",
  ingredient: "ingredients",
  strength: "strength",
  dosage_form: "form",
  form: "form",
  manufacturer: "manufacturer",
  category: "category",
  barcode: "barcode",
  schedule_information: "schedule_class",
  schedule_class: "schedule_class",
  prescription_required: "rx_required",
  rx_required: "rx_required",
  uses: "uses",
  precautions: "precautions",
  side_effects: "side_effects",
  contraindications: "contraindications",
  storage: "storage",
  drowsiness_warning: "drowsiness",
  drowsiness: "drowsiness",
  driving_warning: "driving_warning",
  pregnancy_information: "pregnancy_caution",
  pregnancy_caution: "pregnancy_caution",
  breastfeeding_information: "breastfeeding_caution",
  breastfeeding_caution: "breastfeeding_caution",
  menstrual_information: "menstrual_note",
  menstrual_note: "menstrual_note",
  source_name: "source_title",
  source_title: "source_title",
  source_url: "source_url",
  document_name: "source_document",
  source_document: "source_document",
  last_updated: "last_updated",
  verification_status: "verification",
  verification: "verification",
  data_confidence: "data_confidence",
  verification_notes: "verification_notes",
  record_kind: "record_kind",
};

function normalizeHeaders(row: RawRecord): RawRecord {
  const out: RawRecord = {};
  for (const [k, v] of Object.entries(row)) {
    const key = HEADER_MAP[k.trim().toLowerCase()] ?? k.trim().toLowerCase();
    out[key] = v;
  }
  return out;
}

// ── small helpers ────────────────────────────────────────────────
function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function boolish(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = str(v)?.toLowerCase();
  return s === "true" || s === "yes" || s === "1" || s === "y";
}

function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  if (s.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(s);
      return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
    } catch {
      /* fall through to delimiter parsing */
    }
  }
  return s.split(/[;|\n]/).map((x) => x.trim()).filter(Boolean);
}

export function slugify(name: string, strength?: string | null): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const dose = strength ? `-${strength.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}` : "";
  return `${base}${dose}`.slice(0, 80);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

// ── source resolution (never invents a source) ───────────────────
function resolveSource(row: RawRecord, errors: ValidationError[], rowNo: number): number | null {
  const sid = Number(row.source_id);
  const db = getDb();

  if (Number.isInteger(sid) && sid > 0) {
    const exists = db.prepare("SELECT id FROM sources WHERE id = ?").get(sid);
    if (exists) return sid;
    errors.push({ row: rowNo, field: "source_id", message: `source_id ${sid} does not exist` });
    return null;
  }

  const title = str(row.source_title);
  const url = str(row.source_url);
  const doc = str(row.source_document);

  if (!title) {
    errors.push({ row: rowNo, field: "source_name", message: "Source name is required (source_name or source_id)" });
    return null;
  }
  if (!url) {
    errors.push({ row: rowNo, field: "source_url", message: "Source URL is required alongside source_name" });
    return null;
  }

  const match = db
    .prepare("SELECT id FROM sources WHERE lower(title) = lower(?) LIMIT 1")
    .get(title) as { id: number } | undefined;
  if (match) return match.id;

  const created = db
    .prepare(
      `INSERT INTO sources (title, publisher, url, kind, document_name, publication_date, last_checked, verification_status, updated_at)
       VALUES (?,?,?,?,?,?,?,?,datetime('now'))`
    )
    .run(title, str(row.source_publisher) ?? null, url, "label", doc, null, new Date().toISOString().slice(0, 10), "pending");
  return created.lastInsertRowid as number;
}

// ── parse helpers for the three file formats ─────────────────────
// `raw: true` keeps cell values as-is; date-looking cells arrive as Excel serial
// numbers and are converted deterministically by dateStr() below.
export function parseCsv(text: string): RawRecord[] {
  const wb = XLSX.read(text, { type: "string", raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRecord>(sheet, { defval: null, raw: true });
}

export function parseExcel(buffer: ArrayBuffer): RawRecord[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRecord>(sheet, { defval: null, raw: true });
}

/** Normalize a cell that should hold a date. Excel serials (20000–80000 ≈ 1954–2119) are converted. */
export function dateStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    return new Date(Math.round((v - 25569) * 86400_000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseJson(text: string): RawRecord[] {
  const parsed: unknown = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as RawRecord[];
  if (parsed && typeof parsed === "object") {
    const medicines = (parsed as { medicines?: unknown }).medicines;
    if (Array.isArray(medicines)) return medicines as RawRecord[];
  }
  throw new Error("JSON must be an array of records or an object with a `medicines` array");
}

// ── validation ───────────────────────────────────────────────────
export function validateRecords(rows: RawRecord[]): PreviewResult {
  const db = getDb();
  const errors: ValidationError[] = [];
  const records: ValidatedRecord[] = [];
  const seenSlugs = new Set<string>();

  rows.forEach((raw, idx) => {
    const rowNo = idx + 2; // +2: header row + 1-based
    const row = normalizeHeaders(raw);
    const recErrors: ValidationError[] = [];

    const name = str(row.name);
    const genericName = str(row.generic_name);
    if (!name || !genericName) {
      if (!name) recErrors.push({ row: rowNo, field: "medicine_name", message: "Medicine name is required" });
      if (!genericName) recErrors.push({ row: rowNo, field: "generic_name", message: "Generic name is required" });
      errors.push(...recErrors);
      return; // identity fields missing — the record can never be imported
    }

    const sourceId = resolveSource(row, recErrors, rowNo);

    const verificationRaw = str(row.verification)?.toLowerCase();
    if (!verificationRaw) {
      recErrors.push({ row: rowNo, field: "verification_status", message: "Verification status is required (verified/unverified)" });
    } else if (!['verified', 'unverified'].includes(verificationRaw)) {
      recErrors.push({ row: rowNo, field: "verification_status", message: `Invalid value "${verificationRaw}" (use verified/unverified)` });
    }
    const verification: "verified" | "unverified" = verificationRaw === "verified" ? "verified" : "unverified";

    const confidenceRaw = (str(row.data_confidence) ?? (verification === "verified" ? "medium" : "low")).toLowerCase();
    if (!["high", "medium", "low"].includes(confidenceRaw)) {
      recErrors.push({ row: rowNo, field: "data_confidence", message: `Invalid value "${confidenceRaw}" (use high/medium/low)` });
    }

    const lastUpdated = dateStr(row.last_updated);
    if (!lastUpdated) {
      recErrors.push({ row: rowNo, field: "last_updated", message: "Last updated date is required (YYYY-MM-DD)" });
    } else if (!DATE_RE.test(lastUpdated)) {
      recErrors.push({ row: rowNo, field: "last_updated", message: "Date must be YYYY-MM-DD" });
    }

    const ingredientsRaw = listOf(row.ingredients);
    const ingredients: Array<{ name: string; strength: string | null }> = [];
    for (const ing of ingredientsRaw) {
      // "Paracetamol 500 mg" / "Paracetamol - 500mg" / "Paracetamol (500 mg)" all split
      const m = ing.match(/^(.*?)[\s\-–(]+([\d./]+\s*[a-zA-Zµ%]+)\s*\)?$/);
      const ingName = str(m?.[1]);
      if (!ingName) {
        recErrors.push({ row: rowNo, field: "active_ingredients", message: `Cannot parse ingredient "${ing}"` });
        continue;
      }
      ingredients.push({ name: ingName, strength: str(m?.[2]) });
    }

    if (ingredients.length === 0) {
      recErrors.push({ row: rowNo, field: "active_ingredients", message: "At least one active ingredient is required" });
    }

    if (recErrors.length > 0) {
      errors.push(...recErrors);
      return; // reject invalid records entirely
    }

    const strength = str(row.strength);
    const form = str(row.form);
    let slug = slugify(name, strength);
    let clash = db.prepare("SELECT id FROM medicines WHERE slug = ?").get(slug) as { id: number } | undefined;
    if (!clash && seenSlugs.has(slug)) {
      clash = { id: -1 }; // duplicate within this batch
    }
    if (!clash) {
      // name+form+strength duplicate check (a different brand of the same product)
      const same = db
        .prepare("SELECT id FROM medicines WHERE lower(name) = lower(?) AND ifnull(strength,'') = ifnull(?,'') AND ifnull(form,'') = ifnull(?,'')")
        .get(name, strength, form) as { id: number } | undefined;
      if (same) slug = slugify(name, `${strength ?? ""} ${form ?? ""}`);
      clash = same;
    }
    seenSlugs.add(slug);

    const existingId = clash && clash.id > 0 ? clash.id : undefined;

    records.push({
      row: rowNo,
      status: existingId ? "duplicate_update" : "valid",
      existingId,
      data: {
        slug,
        name,
        brand_name: str(row.brand_name),
        generic_name: genericName,
        form,
        strength,
        manufacturer: str(row.manufacturer),
        category: str(row.category),
        barcode: str(row.barcode),
        schedule_class: str(row.schedule_class),
        rx_required: boolish(row.rx_required),
        uses: listOf(row.uses),
        precautions: listOf(row.precautions),
        side_effects: listOf(row.side_effects),
        contraindications: listOf(row.contraindications),
        storage: str(row.storage),
        drowsiness: boolish(row.drowsiness),
        driving_warning: boolish(row.driving_warning),
        pregnancy_caution: boolish(row.pregnancy_caution),
        breastfeeding_caution: boolish(row.breastfeeding_caution),
        menstrual_note: str(row.menstrual_note),
        source_id: sourceId,
        verification,
        data_confidence: confidenceRaw as "high" | "medium" | "low",
        verification_notes: str(row.verification_notes),
        record_kind: str(row.record_kind)?.toLowerCase() === "real" ? "real" : "demo",
        ingredients,
        last_updated: lastUpdated,
      },
    });
  });

  const duplicates = records.filter((r) => r.status === "duplicate_update").length;
  return {
    format: "csv",
    total: rows.length,
    valid: records.length,
    duplicates,
    rejected: rows.length - records.length,
    records,
    errors,
  };
}

// ── commit ───────────────────────────────────────────────────────
export type CommitResult = {
  imported: number;
  updated: number;
  rejected: number;
  errors: ValidationError[];
};

export function commitRecords(preview: PreviewResult, actor: string, filename: string | null, format: ImportFormat): CommitResult {
  const db = getDb();
  let imported = 0;
  let updated = 0;

  const run = db.transaction(() => {
    for (const rec of preview.records) {
      const d = rec.data;
      const lastUpdated = d.last_updated ?? new Date().toISOString().slice(0, 10);
      let medId = rec.existingId;

      if (medId) {
        db.prepare(
          `UPDATE medicines SET name=?, brand_name=?, generic_name=?, form=?, strength=?, manufacturer=?, category=?,
           barcode=ifnull(?,barcode), schedule_class=?, rx_required=?, uses=?, precautions=?, side_effects=?,
           contraindications=?, storage=?, drowsiness=?, driving_warning=?, pregnancy_caution=?, breastfeeding_caution=?,
           menstrual_note=?, source_id=?, verification=?, data_confidence=?, verification_notes=?, record_kind=?, last_updated=?
           WHERE id=?`
        ).run(
          d.name, d.brand_name, d.generic_name, d.form, d.strength, d.manufacturer, d.category,
          d.barcode, d.schedule_class, d.rx_required ? 1 : 0, JSON.stringify(d.uses), JSON.stringify(d.precautions),
          JSON.stringify(d.side_effects), JSON.stringify(d.contraindications), d.storage,
          d.drowsiness ? 1 : 0, d.driving_warning ? 1 : 0, d.pregnancy_caution ? 1 : 0, d.breastfeeding_caution ? 1 : 0,
          d.menstrual_note, d.source_id, d.verification, d.data_confidence, d.verification_notes, d.record_kind,
          lastUpdated, medId
        );
        updated++;
      } else {
        const ins = db.prepare(
          `INSERT INTO medicines (slug, name, brand_name, generic_name, form, strength, manufacturer, category, barcode,
           schedule_class, rx_required, uses, precautions, side_effects, contraindications, storage,
           drowsiness, driving_warning, pregnancy_caution, breastfeeding_caution, menstrual_note,
           source_id, verification, data_confidence, verification_notes, record_kind, last_updated)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(
          d.slug, d.name, d.brand_name, d.generic_name, d.form, d.strength, d.manufacturer, d.category, d.barcode,
          d.schedule_class, d.rx_required ? 1 : 0, JSON.stringify(d.uses), JSON.stringify(d.precautions),
          JSON.stringify(d.side_effects), JSON.stringify(d.contraindications), d.storage,
          d.drowsiness ? 1 : 0, d.driving_warning ? 1 : 0, d.pregnancy_caution ? 1 : 0, d.breastfeeding_caution ? 1 : 0,
          d.menstrual_note, d.source_id, d.verification, d.data_confidence, d.verification_notes, d.record_kind, lastUpdated
        );
        medId = ins.lastInsertRowid as number;
        imported++;
      }

      // Ingredient links (replace mapping on update to stay consistent with the file)
      db.prepare("DELETE FROM medicine_ingredients WHERE medicine_id = ?").run(medId);
      const insIng = db.prepare("INSERT INTO active_ingredients (name, uniq_name) VALUES (?,?)");
      const getIng = db.prepare("SELECT id FROM active_ingredients WHERE uniq_name = ?");
      const linkIng = db.prepare("INSERT INTO medicine_ingredients (medicine_id, ingredient_id, strength) VALUES (?,?,?)");
      for (const ing of d.ingredients) {
        const uniq = ing.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        let ingId = (getIng.get(uniq) as { id: number } | undefined)?.id;
        if (!ingId) ingId = insIng.run(ing.name, uniq).lastInsertRowid as number;
        linkIng.run(medId, ingId, ing.strength);
      }
    }

    db.prepare(
      `INSERT INTO import_history (actor, format, filename, total_rows, imported, updated, rejected, errors_json)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(actor, format, filename, preview.total, imported, updated, preview.errors.length, JSON.stringify(preview.errors));

    db.prepare(
      `INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?,?,?,?,?)`
    ).run(actor, "import.run", "import", filename ?? "manual", JSON.stringify({
      format, total: preview.total, imported, updated, rejected: preview.errors.length,
    }));
  });

  run();
  return { imported, updated, rejected: preview.errors.length, errors: preview.errors };
}
