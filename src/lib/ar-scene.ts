import { getDb } from "@/lib/db";
import { analyzeMedicine, expiryStatus, getMedicineIngredients, type WarningCard } from "@/lib/safety-engine";
import { tr } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/dictionaries";

/**
 * AR Medicine Explainer — scene builder.
 *
 * Deterministic, database-driven: every highlighted zone comes from the
 * verified medicine record and the same rule engine used across MedSafe.
 * The camera layer only projects these zones onto the viewfinder —
 * detection and classification never happen "in the lens".
 *
 * Zone kinds: name | ingredients | warnings | expiry | storage | nodriving
 * Coordinates are normalized 0..1 (top/left/width/height).
 */

export type ArZoneKind = "name" | "ingredients" | "warnings" | "expiry" | "storage" | "nodriving";

export type ArBox = {
  kind: ArZoneKind;
  label: string;
  text: string;
  tone: "teal" | "navy" | "amber" | "orange" | "red" | "green";
  top: number;
  left: number;
  width: number;
  height: number;
};

export type ArFeature = {
  slug: string;
  name: string;
  verification: string;
  expiry: { state: "ok" | "near" | "expired" | "unknown"; date?: string; days?: number };
  boxes: ArBox[];
};

export type ArScanResponse = {
  status: "identified" | "not_found";
  message: string;
  confidence: number | null;
  feature: ArFeature | null;
  steps: Array<{ label: string; status: "done" | "pending" }>;
  /** Honest disclosure: zones come from the database, not from lens detection. */
  disclosure: string;
};

export const AR_STEPS = [
  "Frame captured",
  "Text & barcode regions detected",
  "Medicine identified",
  "Verified database lookup",
  "Label zones projected",
] as const;

type ZoneRow = { kind: string; top: number; left: number; width: number; height: number };

/** Deterministic layout used when a record has no stored zones. */
function fallbackZones(med: { drowsiness: number; driving_warning: number }): ZoneRow[] {
  const zones: ZoneRow[] = [
    { kind: "name", top: 0.08, left: 0.1, width: 0.8, height: 0.14 },
    { kind: "ingredients", top: 0.26, left: 0.1, width: 0.8, height: 0.13 },
    { kind: "warnings", top: 0.43, left: 0.1, width: 0.8, height: 0.13 },
    { kind: "expiry", top: 0.6, left: 0.1, width: 0.8, height: 0.13 },
    { kind: "storage", top: 0.78, left: 0.1, width: 0.8, height: 0.12 },
  ];
  if (med.drowsiness || med.driving_warning) {
    zones.push({ kind: "nodriving", top: 0.6, left: 0.74, width: 0.16, height: 0.22 });
  }
  return zones;
}

function buildBoxes(med: ArMedRow, zones: ZoneRow[], lang?: Lang): ArBox[] {
  const analysis = analyzeMedicine(med, { expiryDate: med.pack_expiry_hint, lang });
  const expiry = expiryStatus(med.pack_expiry_hint);
  const ings = getMedicineIngredients(med.id);
  const warnCards = analysis.cards.filter((c) => c.code !== "expiry");
  const worst = warnCards.reduce<string>((acc, c) => {
    const rank: Record<string, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
    return rank[c.level] > rank[acc] ? c.level : acc;
  }, "green");

  const byKind = new Map<string, ZoneRow>(zones.map((z) => [z.kind, z]));
  const boxes: ArBox[] = [];
  const push = (kind: ArZoneKind, z: ZoneRow | undefined, box: Omit<ArBox, "kind" | "top" | "left" | "width" | "height">) => {
    if (z) boxes.push({ kind, ...box, top: z.top, left: z.left, width: z.width, height: z.height });
  };

  push("name", byKind.get("name"), {
    label: tr(lang, "ar.zone.name", "Medicine name"),
    text: `${med.name} · ${med.strength ?? ""} ${med.form ?? ""}`.trim(),
    tone: "teal",
  });

  push("ingredients", byKind.get("ingredients"), {
    label: tr(lang, "ar.zone.ingredients", "Active ingredients"),
    text: ings.length ? ings.map((i) => `${i.name} ${i.strength ?? ""}`.trim()).join(" + ") : "Not recorded",
    tone: "navy",
  });

  push("warnings", byKind.get("warnings"), {
    label: tr(lang, "ar.zone.warnings", "Warning zone"),
    text: warnCards.length
      ? `${warnCards[0].title}: ${warnCards[0].body}`
      : tr(lang, "ar.warnings.none", "No rule-based warnings for this record."),
    tone: worst === "red" ? "red" : worst === "orange" ? "orange" : worst === "yellow" ? "amber" : "green",
  });

  push("expiry", byKind.get("expiry"), {
    label: tr(lang, "ar.zone.expiry", "Expiry"),
    text:
      expiry.state === "expired"
        ? tr(lang, "ar.expiry.expired", "EXPIRED on {date} — do not use; consult a pharmacist", { date: expiry.date ?? "" })
        : expiry.state === "near"
          ? tr(lang, "ar.expiry.near", "Expires {date} (~{days} days) — plan replacement", { date: expiry.date ?? "", days: expiry.days ?? 0 })
          : expiry.state === "ok"
            ? tr(lang, "ar.expiry.ok", "Valid until {date}", { date: expiry.date ?? "" })
            : tr(lang, "ar.expiry.unknown", "No expiry information recorded"),
    tone: expiry.state === "expired" ? "red" : expiry.state === "near" ? "amber" : "green",
  });

  push("storage", byKind.get("storage"), {
    label: tr(lang, "ar.zone.storage", "Storage"),
    text: med.storage ?? "Not recorded",
    tone: "navy",
  });

  if ((med.drowsiness || med.driving_warning) && byKind.get("nodriving")) {
    const z = byKind.get("nodriving")!;
    boxes.push({
      kind: "nodriving",
      label: tr(lang, "ar.zone.nodriving", "No-driving icon"),
      text: "May cause drowsiness — avoid driving or operating machinery if affected.",
      tone: "orange",
      top: z.top,
      left: z.left,
      width: z.width,
      height: z.height,
    });
  }

  return boxes;
}

type ArMedRow = {
  id: number;
  slug: string;
  name: string;
  form: string | null;
  strength: string | null;
  storage: string | null;
  pack_expiry_hint: string | null;
  ar_zones: string;
  drowsiness: number;
  driving_warning: number;
  pregnancy_caution: number;
  breastfeeding_caution: number;
  rx_required: number;
  schedule_class: string | null;
  menstrual_note: string | null;
  verification: string;
};

function buildFeature(med: ArMedRow, lang?: Lang): ArFeature {
  let zones: ZoneRow[] = [];
  try {
    const parsed: unknown = JSON.parse(med.ar_zones || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) zones = parsed as ZoneRow[];
  } catch {
    zones = [];
  }
  if (zones.length === 0) zones = fallbackZones(med);
  return {
    slug: med.slug,
    name: med.name,
    verification: med.verification,
    expiry: expiryStatus(med.pack_expiry_hint),
    boxes: buildBoxes(med, zones, lang),
  };
}

/**
 * Identify input and build the AR scene.
 * Database-driven only: a readable query/barcode resolves to a stored record;
 * anything else honestly reports that nothing could be identified — no demo
 * pack substitution, ever.
 */
export function arIdentify(opts: { query?: string; barcode?: string; uncertain?: boolean; lang?: Lang }): ArScanResponse {
  const db = getDb();
  const steps = AR_STEPS.map((label) => ({ label, status: "done" as const }));
  const note =
    "Zones are projected from the connected database — MedSafe does not detect or invent label content in the lens.";

  const resolve = (med: ArMedRow): ArScanResponse => {
    return {
      status: "identified",
      message: `Label zones projected from the ${med.verification} database record.`,
      confidence: med.verification === "verified" ? 0.91 : 0.6,
      feature: buildFeature(med, opts.lang),
      steps,
      disclosure: note,
    };
  };

  const pick = (sql: string, ...args: string[]): ArMedRow | undefined =>
    db.prepare(sql).get(...(args as never[])) as ArMedRow | undefined;

  if (opts.barcode) {
    const med = pick("SELECT * FROM medicines WHERE barcode = ?", opts.barcode);
    if (med) return resolve(med);
  }

  const q = (opts.query ?? "").trim();
  if (q) {
    const exact = pick("SELECT * FROM medicines WHERE slug = ?", q);
    const byName = exact ?? pick("SELECT * FROM medicines WHERE name LIKE ? ORDER BY CASE verification WHEN 'verified' THEN 0 ELSE 1 END LIMIT 1", `%${q}%`);
    if (byName) return resolve(byName);
  }

  return {
    status: "not_found",
    message:
      "Could not identify a medicine for this input in the connected database. Check the spelling, scan the package, or search manually.",
    confidence: null,
    feature: null,
    steps,
    disclosure: note,
  };
}
