import { getDb } from "@/lib/db";
import { tr, levelLabel } from "@/lib/i18n/server";
import type { Lang } from "@/lib/i18n/dictionaries";

/**
 * Deterministic safety analysis engine.
 * Classifications come from database flags/rules ONLY — the AI layer never invents them.
 *
 * Levels: green = General Awareness, yellow = Caution,
 *         orange = Professional Supervision, red = Important Warning
 *
 * Content is available in English (source), हिंदी and मराठी via the translations table.
 */

export type LangT = Lang | undefined;

export type WarningCard = {
  code: string;
  level: "green" | "yellow" | "orange" | "red";
  title: string;
  body: string;
  source?: string;
};

export type ExpiryStatus = {
  state: "ok" | "near" | "expired" | "unknown";
  date?: string;
  days?: number;
};

export type SafetyAnalysis = {
  overall: Level;
  cards: WarningCard[];
  expiry: ExpiryStatus;
  duplicateIngredientIds: number[];
};

export type MedicineCore = {
  id: number;
  slug?: string;
  verification: string;
  drowsiness: number;
  driving_warning: number;
  pregnancy_caution: number;
  breastfeeding_caution: number;
  rx_required: number;
  schedule_class: string | null;
  pack_expiry_hint: string | null;
  menstrual_note: string | null;
};

const NEAR_EXPIRY_DAYS = 90;

export type Level = "green" | "yellow" | "orange" | "red";

export function expiryStatus(dateStr?: string | null): ExpiryStatus {
  if (!dateStr) return { state: "unknown" };
  const d = new Date(dateStr + "T23:59:59");
  if (Number.isNaN(d.getTime())) return { state: "unknown", date: dateStr };
  const days = Math.ceil((d.getTime() - Date.now()) / 86400_000);
  if (days < 0) return { state: "expired", date: dateStr, days };
  if (days <= NEAR_EXPIRY_DAYS) return { state: "near", date: dateStr, days };
  return { state: "ok", date: dateStr, days };
}

const LEVEL_RANK: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };

function topLevel(cards: WarningCard[]): Level {
  return cards.reduce<Level>((acc, c) => (LEVEL_RANK[c.level] > LEVEL_RANK[acc] ? c.level : acc), "green");
}

/** Language-aware warning-card constructor. `key` targets the translations table for hi/mr. */
function card(
  lang: LangT,
  code: string,
  level: Level,
  titleEn: string,
  bodyEn: string,
  key?: string
): WarningCard {
  if (lang && lang !== "en" && key) {
    return {
      code,
      level,
      title: tr(lang, `${key}.title`, titleEn),
      body: tr(lang, `${key}.body`, bodyEn),
    };
  }
  return { code, level, title: titleEn, body: bodyEn };
}

/** Interpolated variants for the parameterised expiry rules. */
function expiryCard(lang: LangT, state: "expired" | "near", expiry: ExpiryStatus): WarningCard {
  if (state === "expired") {
    return {
      code: "expiry",
      level: "red",
      title: tr(lang, "rule.expiry.red.title", "Expired Medicine Warning"),
      body: tr(lang, "rule.expiry.red.body",
        "This medicine expired on {date}. Do not use an expired medicine without professional guidance. Contact a pharmacist for safe disposal or replacement.",
        { date: expiry.date ?? "" }),
    };
  }
  return {
    code: "expiry",
    level: "yellow",
    title: tr(lang, "rule.expiry.near.title", "Near Expiry Reminder"),
    body: tr(lang, "rule.expiry.near.body",
      "This medicine expires on {date} (in about {days} days). Plan replacement and check with a pharmacist before long-term use.",
      { date: expiry.date ?? "", days: expiry.days ?? 0 }),
  };
}

/**
 * Rule-based safety analysis for one medicine.
 * Every card is generated from verified DB flags + rule text — never by the AI.
 */
export function analyzeMedicine(
  med: MedicineCore,
  opts?: { expiryDate?: string | null; lang?: Lang }
): SafetyAnalysis {
  const lang = opts?.lang;
  const cards: WarningCard[] = [];
  const slug = med.slug ?? "";

  // Verification awareness
  if (med.verification !== "verified") {
    cards.push(card(lang, "unverified", "orange",
      "Unverified Record",
      "This medicine record has not been verified by a reviewer yet. Treat the information shown as incomplete and confirm with a pharmacist.",
      "rule.unverified"));
  }

  // Prescription awareness (rule: rx_required or schedule text)
  if (med.rx_required) {
    cards.push(card(lang, "prescription", "red",
      "Prescription Awareness",
      "This medicine is prescription-only. A qualified doctor must decide whether it is right for you — do not self-medicate or share it.",
      "rule.prescription.rx"));
  } else if (med.schedule_class && /schedule/i.test(med.schedule_class)) {
    cards.push({
      code: "prescription",
      level: "yellow",
      title: tr(lang, "rule.prescription.schedule.title", "Prescription Awareness"),
      body: tr(lang, "rule.prescription.schedule.body",
        `Regulatory class: ${med.schedule_class}. Check the label and ask a pharmacist if you are unsure about access rules.`,
        { class: med.schedule_class }),
    });
  }

  // Drowsiness & driving (rule: DB flag)
  if (med.drowsiness || med.driving_warning) {
    cards.push(card(lang, "drowsiness", "orange",
      "Drowsiness Awareness",
      "This medicine may affect alertness or reaction time. Avoid driving or operating machinery if you feel drowsy or impaired.",
      "rule.drowsiness"));
  }

  // Pregnancy / breastfeeding awareness (rule: DB flags)
  if (med.pregnancy_caution) {
    cards.push(card(lang, "pregnancy", "yellow",
      "Pregnancy Awareness",
      "If you are pregnant or planning pregnancy, ask a doctor before using this medicine.",
      "rule.pregnancy"));
  }
  if (med.breastfeeding_caution) {
    cards.push(card(lang, "breastfeeding", "yellow",
      "Breastfeeding Awareness",
      "If you are breastfeeding, check with a doctor or pharmacist before using this medicine.",
      "rule.breastfeeding"));
  }

  // Menstrual / hormonal awareness (rule: DB note; translated note overrides)
  if (med.menstrual_note) {
    const noteT = lang && lang !== "en" ? tr(lang, `mednote.${slug}`, "") : "";
    const bodyT = noteT
      ? noteT + tr(lang, "rule.menstrual.suffix",
          " Some medicines may affect menstrual patterns in certain people. This does not confirm that the medicine caused a change — consult a qualified healthcare professional for personal advice.")
      : med.menstrual_note +
        " Some medicines may affect menstrual patterns in certain people. This does not confirm that the medicine caused a change — consult a qualified healthcare professional for personal advice.";
    cards.push(card(lang, "menstrual", "yellow",
      "Menstrual / Hormonal Awareness",
      bodyT,
      "rule.menstrual"));
  }

  // Expiry (rule: date comparison; uses explicit date, else pack hint as demo)
  const expiry = expiryStatus(opts?.expiryDate ?? med.pack_expiry_hint);
  if (expiry.state === "expired") cards.push(expiryCard(lang, "expired", expiry));
  else if (expiry.state === "near") cards.push(expiryCard(lang, "near", expiry));

  return { overall: topLevel(cards), cards, expiry, duplicateIngredientIds: [] };
}

export type IngredientRow = { id: number; name: string; uniq_name: string; strength: string | null };

export function getMedicineIngredients(medicineId: number): IngredientRow[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT ai.id, ai.name, ai.uniq_name, mi.strength
       FROM medicine_ingredients mi JOIN active_ingredients ai ON ai.id = mi.ingredient_id
       WHERE mi.medicine_id = ? ORDER BY ai.name`
    )
    .all(medicineId) as IngredientRow[];
}

/** Levels used across the UI — kept for backwards compatibility (English). */
export const LEVEL_LABELS: Record<Level, string> = {
  green: "General Awareness",
  yellow: "Caution",
  orange: "Professional Supervision",
  red: "Important Warning",
};

export { levelLabel };

function uniqNameOf(ingredientId: number): string {
  const db = getDb();
  const row = db.prepare("SELECT uniq_name FROM active_ingredients WHERE id = ?").get(ingredientId) as
    | { uniq_name: string }
    | undefined;
  return row?.uniq_name ?? String(ingredientId);
}

/** Cross-medicine checks: duplicate ingredients between two medicine lists. */
export function crossMedicineChecks(
  base: IngredientRow[],
  other: IngredientRow[],
  lang?: Lang
): { duplicates: IngredientRow[]; warnings: WarningCard[] } {
  const warnings: WarningCard[] = [];
  const all: IngredientRow[] = other;
  const baseIds = new Set(base.map((i) => i.id));
  const duplicates = other.filter((i) => baseIds.has(i.id));

  if (duplicates.length > 0) {
    const namesEn = duplicates.map((d) => d.name).join(", ");
    warnings.push({
      code: "duplicate",
      level: "orange",
      title: tr(lang, "rule.duplicate.title", "Duplicate Active Ingredient Detected"),
      body: tr(lang, "rule.duplicate.body",
        `Both medicines contain the same active ingredient (${namesEn}). Check with a doctor or pharmacist before using them together.`,
        { names: namesEn }),
    });
  }

  // Interaction lookup (deterministic, from the interactions table)
  const db = getDb();
  const otherIds = other.map((i) => i.id);
  for (const a of base) {
    for (const b of otherIds) {
      const row = db
        .prepare(
          `SELECT severity, description FROM interactions
           WHERE (ingredient_a = ? AND ingredient_b = ?) OR (ingredient_a = ? AND ingredient_b = ?)`
        )
        .get(a.id, b, b, a.id) as { severity: string; description: string } | undefined;
      if (row) {
        const otherIng = all.find((o) => o.id === b);
        const otherName = otherIng?.name ?? "";
        const bodyEn = `${a.name} (this medicine) + ${otherName}: ${row.description}`;
        const key = `interaction.${[a.uniq_name, otherIng?.uniq_name ?? ""].sort().join("__")}`;
        const descT = lang && lang !== "en" ? tr(lang, key, row.description) : row.description;
        warnings.push({
          code: "interaction",
          level: row.severity === "caution" ? "yellow" : (row.severity as Level),
          title: tr(lang, "rule.interaction.title", "Interaction Awareness"),
          body: lang && lang !== "en" ? `${a.name} + ${otherName}: ${descT}` : bodyEn,
        });
      }
    }
  }

  return { duplicates, warnings };
}
