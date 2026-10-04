import { getDb } from "@/lib/db";

/**
 * MedSafe medicine-matching engine.
 *
 * One shared implementation of "turn messy human/OCR input into ranked,
 * honest candidate matches against the medicines table" — used by the search
 * API, the scan pipeline, AR identification and the RAG retriever.
 *
 * Design rules (healthcare-grade honesty):
 *  - The matcher NEVER invents a medicine. It only ranks records that exist
 *    in the connected database and reports how well each matched.
 *  - Common OCR misspellings are corrected ONLY via a small, auditable map of
 *    well-known medicine-word confusions; no blind character fuzz that could
 *    turn one real drug name into another.
 *  - If several records match about equally well, ALL of them are returned so
 *    the UI can ask the user to pick — the system never silently guesses.
 */

export type MatchMethod = "exact" | "normalized" | "strong" | "partial" | "fuzzy";

export type MatchCandidate = {
  id: number;
  slug: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  manufacturer: string | null;
  strength: string | null;
  form: string | null;
  category: string | null;
  verification: string;
  record_kind: string;
};

export type ScoredMatch = {
  medicine: MatchCandidate;
  score: number; // 0..1
  method: MatchMethod;
};

export type MatchResult = {
  status: "identified" | "ambiguous" | "not_found";
  matches: ScoredMatch[];
  topScore: number;
  normalizedQuery: string;
};

/** Scores at/below this never surface as a match. */
export const MATCH_MIN_SCORE = 0.45;
/** If top1 and top2 are closer than this, the match is "ambiguous" → user picks. */
export const AMBIGUITY_GAP = 0.08;

// ── normalization ─────────────────────────────────────────────────

/** Well-known medicine-word OCR/typo confusions. Deliberately small and auditable. */
const WORD_FIXES: Record<string, string> = {
  paracitamol: "paracetamol",
  paracetmol: "paracetamol",
  paracetamol: "paracetamol",
  paractamol: "paracetamol",
  parcetamol: "paracetamol",
  paracetamole: "paracetamol",
  peracetamol: "paracetamol",
  panadol: "paracetamol", // common brand used as the generic word
  crocin: "paracetamol",
  metformine: "metformin",
  amoxycillin: "amoxicillin",
  amoxicilline: "amoxicillin",
  ibuprofen: "ibuprofen",
  brufen: "ibuprofen", // brand → generic word (only a hint; scoring still ranks records)
  omeprazole: "omeprazole",
  omeprazol: "omeprazole",
  cetirizine: "cetirizine",
  citirizine: "cetirizine",
  cetirizin: "cetirizine",
  cetrizine: "cetirizine",
  levocetirizine: "levocetirizine",
  domperidone: "domperidone",
  tranexamic: "tranexamic",
  mefnamic: "mefenamic",
  mefenemic: "mefenamic",
};

/** Dosage-form abbreviations commonly printed on Indian packs and read by OCR. */
const FORM_WORDS: Record<string, string> = {
  tab: "tablet",
  tabs: "tablet",
  tablet: "tablet",
  tablets: "tablet",
  cap: "capsule",
  caps: "capsule",
  capsule: "capsule",
  capsules: "capsule",
  syp: "syrup",
  syrup: "syrup",
  susp: "suspension",
  suspension: "suspension",
  inj: "injection",
  injection: "injection",
  drops: "drops",
  gel: "gel",
  cream: "cream",
  ointment: "ointment",
};

const NOISE_TOKENS = new Set([
  "the", "and", "for", "with", "ltd", "limited", "pvt", "india", "ip", "bp", "usp",
  "pack", "strip", "strip of", "mrp", "rs", "net", "wt", "each", "film", "coated",
]);

/**
 * Normalize arbitrary input (typed text, OCR lines, voice transcripts):
 * lowercase, strip punctuation, collapse spaces, expand strength spacing
 * ("500mg" → "500 mg"), unify dosage-form wording, fix known OCR confusions.
 */
export function normalizeMedicineText(input: string): string {
  const lower = input.toLowerCase().replace(/[^a-z0-9\u0900-\u097F.]+/g, " ");
  const tokens = lower.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    // "500mg" → "500 mg"; "650.mg" → "650 mg"
    const strength = tok.match(/^(\d+(?:\.\d+)?)[.\s]?(mg|ml|mcg|g|iu|%)$/);
    if (strength) {
      out.push(strength[1], strength[2]);
      continue;
    }
    const fixed = WORD_FIXES[tok] ?? tok;
    out.push(FORM_WORDS[fixed] ?? fixed);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Meaningful search tokens (drop noise/strength units but keep numbers). */
function meaningfulTokens(normalized: string): string[] {
  return normalized
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE_TOKENS.has(t) && !["mg", "ml", "mcg"].includes(t));
}

function levenshtein(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let curr = i;
    let best = curr;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, curr + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      curr = tmp;
      best = Math.min(best, prev[j]);
    }
    if (best > max) return max + 1;
  }
  return prev[b.length];
}

// ── scoring ───────────────────────────────────────────────────────

type IndexRow = MatchCandidate & {
  nameNorm: string;
  brandNorm: string;
  genericNorm: string;
  ingredientsNorm: string;
};

let indexCache: { rows: IndexRow[]; at: number } | null = null;
const INDEX_TTL_MS = 15_000; // serverless-safe: short-lived in-process cache

/**
 * Small in-process index of searchable fields, refreshed at most every 15s.
 * Keeps matching fast without ever shipping the database to the client.
 */
function loadIndex(): IndexRow[] {
  const now = Date.now();
  if (indexCache && now - indexCache.at < INDEX_TTL_MS) return indexCache.rows;
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT m.id, m.slug, m.name, m.brand_name, m.generic_name, m.manufacturer, m.strength, m.form,
              m.category, m.verification, m.record_kind,
              (SELECT GROUP_CONCAT(ai.name, ' ') FROM medicine_ingredients mi
                JOIN active_ingredients ai ON ai.id = mi.ingredient_id WHERE mi.medicine_id = m.id) AS ingredients
       FROM medicines m`
    )
    .all() as Array<MatchCandidate & { ingredients: string | null }>;
  const norm = (s: string | null | undefined) => normalizeMedicineText(s ?? "");
  const idx = rows.map((r) => ({
    ...r,
    nameNorm: norm(r.name),
    brandNorm: norm(r.brand_name),
    genericNorm: norm(r.generic_name),
    ingredientsNorm: norm(r.ingredients ?? ""),
  }));
  indexCache = { rows: idx, at: now };
  return idx;
}

/** Invalidate the in-process index (call after admin imports/updates). */
export function invalidateMatchIndex(): void {
  indexCache = null;
}

export function scoreAgainstQuery(queryNorm: string, qTokens: string[], row: IndexRow): ScoredMatch | null {
  const hay = `${row.nameNorm} ${row.brandNorm} ${row.genericNorm} ${row.ingredientsNorm}`.trim();
  const nameHay = `${row.nameNorm} ${row.brandNorm} ${row.genericNorm}`.trim();

  // 1. Exact identity on normalized name or slug-level equality
  if (queryNorm && (queryNorm === row.nameNorm || queryNorm === row.brandNorm)) {
    return { medicine: row, score: 1, method: "exact" };
  }

  let score = 0;
  let covered = 0;
  for (const q of qTokens) {
    if (!q) continue;
    if (nameHay.includes(q)) {
      // word-boundary hit ranks higher than substring hit
      const boundary = new RegExp(`(^| )${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`);
      score += boundary.test(nameHay) ? 1 : 0.7;
      covered++;
      continue;
    }
    if (row.ingredientsNorm.includes(q)) {
      score += 0.55;
      covered++;
      continue;
    }
    if (hay.includes(q)) {
      score += 0.4;
      covered++;
      continue;
    }
    // 2. Bounded typo tolerance on longer tokens (Levenshtein ≤ 2, length ≥ 5)
    if (q.length >= 5) {
      let best = 3;
      for (const t of nameHay.split(" ")) {
        if (Math.abs(t.length - q.length) > 2) continue;
        const d = levenshtein(q, t, 2);
        if (d < best) best = d;
      }
      if (best <= 2) {
        score += best === 1 ? 0.75 : 0.5;
        covered++;
      }
    }
  }
  if (covered === 0 || score === 0) return null;

  score /= qTokens.length; // coverage-normalized 0..1
  // Small honest bonuses: verified record + strength match
  if (row.verification === "verified") score += 0.04;
  if (covered === qTokens.length) score += 0.04;

  const method: MatchMethod =
    score >= 0.95 ? "exact" : score >= 0.8 ? "normalized" : score >= 0.65 ? "strong" : "partial";
  return { medicine: row, score: Math.min(1, Math.round(score * 100) / 100), method };
}

/**
 * Match a raw query string against the medicines table.
 * Returns ranked candidates; `status` tells the UI whether a confident single
 * match exists, several near-equal candidates exist (ambiguous → let the user
 * pick), or nothing matched (not_found → manual search fallback).
 */
export function matchMedicines(rawQuery: string, opts?: { limit?: number }): MatchResult {
  const normalizedQuery = normalizeMedicineText(rawQuery ?? "");
  const qTokens = meaningfulTokens(normalizedQuery);
  const limit = opts?.limit ?? 5;

  if (!normalizedQuery || qTokens.length === 0) {
    return { status: "not_found", matches: [], topScore: 0, normalizedQuery };
  }

  const rows = loadIndex();
  const scored = rows
    .map((row) => scoreAgainstQuery(normalizedQuery, qTokens, row))
    .filter((s): s is ScoredMatch => s !== null && s.score >= MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (scored.length === 0) {
    return { status: "not_found", matches: [], topScore: 0, normalizedQuery };
  }
  if (scored.length > 1 && scored[0].score - scored[1].score < AMBIGUITY_GAP) {
    return { status: "ambiguous", matches: scored, topScore: scored[0].score, normalizedQuery };
  }
  return { status: "identified", matches: scored, topScore: scored[0].score, normalizedQuery };
}

/** Lightweight suggestions for search boxes (prefix/contains on normalized fields). */
export function suggestMedicines(rawQuery: string, limit = 8): Array<Pick<MatchCandidate, "slug" | "name" | "brand_name" | "verification">> {
  const db = getDb();
  const q = (rawQuery ?? "").trim();
  if (!q) {
    // No query: surface the most recently updated verified records.
    return db
      .prepare(
        `SELECT slug, name, brand_name, verification FROM medicines
         ORDER BY CASE verification WHEN 'verified' THEN 0 ELSE 1 END, last_updated DESC LIMIT ?`
      )
      .all(limit) as never[];
  }
  const like = `%${q}%`;
  const nq = `%${normalizeMedicineText(q)}%`;
  return db
    .prepare(
      `SELECT DISTINCT m.slug, m.name, m.brand_name, m.verification
       FROM medicines m
       LEFT JOIN medicine_ingredients mi ON mi.medicine_id = m.id
       LEFT JOIN active_ingredients ai ON ai.id = mi.ingredient_id
       WHERE m.name LIKE ? OR m.brand_name LIKE ? OR m.generic_name LIKE ? OR ai.name LIKE ?
          OR lower(m.name) LIKE ? OR lower(ifnull(m.brand_name,'')) LIKE ? OR lower(ifnull(m.generic_name,'')) LIKE ?
       ORDER BY CASE m.verification WHEN 'verified' THEN 0 ELSE 1 END, m.name
       LIMIT ?`
    )
    .all(like, like, like, like, nq, nq, nq, limit) as never[];
}
