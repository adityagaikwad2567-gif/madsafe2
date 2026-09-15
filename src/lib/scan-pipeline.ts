import { getDb } from "@/lib/db";

/**
 * Scan identification pipeline — real input, deterministic matching.
 *
 * The browser client performs REAL barcode decoding (ZXing / BarcodeDetector)
 * and REAL on-device OCR (tesseract.js) and sends the recognized text or code
 * here. This module never invents input: an empty or low-signal extraction
 * honestly returns "uncertain" and never falls back to a demo medicine.
 */

export type ScanStep = { label: string; detail: string; status: "done" | "pending" };

export type ScanCandidate = {
  slug: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  manufacturer: string | null;
  strength: string | null;
};

export type ScanResult = {
  status: "identified" | "uncertain" | "not_found";
  message: string;
  confidence: number | null; // 0..1, never presented as certainty
  candidates: ScanCandidate[];
  method: "camera" | "upload" | "barcode" | "manual" | "voice";
  steps: ScanStep[];
  ocrText: string[];
};

export const SCAN_STEPS = [
  "Image captured / decoded",
  "OCR & barcode extraction",
  "Medicine identification",
  "Verified database lookup",
  "Safety analysis",
] as const;

export function buildSteps(finalStep: number): ScanStep[] {
  return SCAN_STEPS.map((label, i) => ({
    label,
    detail: i < finalStep ? "completed" : i === finalStep ? "current" : "pending",
    status: i < finalStep ? "done" : i === finalStep ? "pending" : "pending",
  }));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u0900-\u097F ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !["the", "and", "for", "tablet", "tab", "mg", "ml"].includes(t));
}

export function identifyByBarcode(code: string): ScanResult {
  const db = getDb();
  const trimmed = code.trim();
  const med = db
    .prepare(
      "SELECT slug, name, brand_name, generic_name, manufacturer, strength FROM medicines WHERE barcode = ?"
    )
    .get(trimmed) as ScanCandidate | undefined;

  const steps = buildSteps(5);
  if (med) {
    return {
      status: "identified",
      message: "Barcode matched a verified medicine record.",
      confidence: 0.97,
      candidates: [med],
      method: "barcode",
      steps,
      ocrText: [`Decoded barcode: ${trimmed}`],
    };
  }
  return {
    status: "not_found",
    message:
      "Barcode decoded successfully, but it is not in the verified database. Try manual search — and remember a barcode cannot prove a medicine is genuine.",
    confidence: null,
    candidates: [],
    method: "barcode",
    steps,
    ocrText: [`Decoded barcode: ${trimmed}`],
  };
}

/**
 * Match OCR/typed text against the medicines table using token-overlap scoring.
 * `ocrConfidence` (0..1, from tesseract.js) downgrades results from noisy reads.
 */
export function identifyByText(
  query: string,
  method: ScanResult["method"],
  opts?: { ocrConfidence?: number }
): ScanResult {
  const db = getDb();
  const tokens = tokenize(query);
  const steps = buildSteps(5);

  if (tokens.length === 0) {
    return {
      status: "uncertain",
      message:
        "No readable medicine text was recognized. Please retake the photo with the package name in focus, or search manually.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: query.trim() ? [`Recognized text: "${query.trim().slice(0, 120)}"`] : [],
    };
  }

  const all = db
    .prepare("SELECT slug, name, brand_name, generic_name, manufacturer, strength, verification FROM medicines")
    .all() as Array<ScanCandidate & { verification: string }>;

  const scored = all
    .map((m) => {
      const hay = tokenize([m.name, m.brand_name ?? "", m.generic_name ?? ""].join(" ")).join(" ");
      let hits = 0;
      for (const t of tokens) if (hay.includes(t)) hits++;
      const nameHit = tokens.some((t) => m.name.toLowerCase().includes(t)) ? 0.5 : 0;
      const verifiedBonus = m.verification === "verified" ? 0.08 : 0;
      return { med: m, score: Math.min(0.92, (hits / tokens.length) * 0.6 + nameHit + verifiedBonus) };
    })
    .filter((r) => r.score > 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (scored.length === 0 || scored[0].score < 0.35) {
    return {
      status: "not_found",
      message:
        "No matching medicine found in the verified database. Check the spelling or try manual search. MedSafe never guesses an unidentified medicine.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: [`Recognized text: "${query.trim().slice(0, 120)}"`],
    };
  }

  const top = scored[0];
  const capped = top.med.verification === "verified" ? Math.min(0.92, top.score) : Math.min(0.55, top.score);
  // Noisy OCR (low mean word confidence) must not masquerade as a confident match.
  const ocrPenalty = typeof opts?.ocrConfidence === "number" ? Math.max(0.5, opts.ocrConfidence) : 1;
  const finalConfidence = Math.round(capped * ocrPenalty * 100) / 100;

  if (finalConfidence < 0.35) {
    return {
      status: "uncertain",
      message:
        "The recognized text was too unclear for a confident match. Please review or retype the name below.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: [`Recognized text: "${query.trim().slice(0, 120)}"`],
    };
  }

  return {
    status: "identified",
    message: `Matched against the ${top.med.verification} database record.`,
    confidence: finalConfidence,
    candidates: scored.map((s) => s.med),
    method,
    steps,
    ocrText: [`Recognized text: "${query.trim().slice(0, 120)}"`],
  };
}
