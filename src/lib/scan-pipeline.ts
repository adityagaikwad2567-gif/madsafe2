import { getDb } from "@/lib/db";
import { matchMedicines, type ScoredMatch } from "@/lib/medicine-matching";

/**
 * Scan identification pipeline — real input, deterministic matching.
 *
 * The browser client performs REAL barcode decoding (ZXing / BarcodeDetector)
 * and REAL on-device OCR (tesseract.js) and sends the recognized text or code
 * here. This module never invents input: an empty or low-signal extraction
 * honestly returns "uncertain" and never falls back to a demo medicine.
 *
 * Text matching is delegated to the shared medicine-matching engine
 * (normalization, strength variants, dosage-form wording, bounded OCR-typo
 * tolerance) so scanning and searching behave identically.
 */

export type ScanStep = { label: string; detail: string; status: "done" | "pending" };

export type ScanCandidate = {
  slug: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  manufacturer: string | null;
  strength: string | null;
  matchScore?: number;
  matchMethod?: string;
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
 * Match OCR/typed text against the medicines table via the shared engine.
 * `ocrConfidence` (0..1, from tesseract.js word confidences) downgrades
 * results from noisy reads — low-confidence reads refuse rather than guess.
 */
export function identifyByText(
  query: string,
  method: ScanResult["method"],
  opts?: { ocrConfidence?: number }
): ScanResult {
  const steps = buildSteps(5);
  const recognized = query.trim();

  if (!recognized) {
    return {
      status: "uncertain",
      message:
        "No readable medicine text was recognized. Please retake the photo with the package name in focus, or search manually.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: [],
    };
  }

  const result = matchMedicines(recognized, { limit: 4 });
  const toCandidate = (m: ScoredMatch): ScanCandidate => ({
    slug: m.medicine.slug,
    name: m.medicine.name,
    brand_name: m.medicine.brand_name,
    generic_name: m.medicine.generic_name,
    manufacturer: m.medicine.manufacturer,
    strength: m.medicine.strength,
    matchScore: m.score,
    matchMethod: m.method,
  });

  // Noisy OCR (low mean word confidence) must not masquerade as a confident match.
  if (typeof opts?.ocrConfidence === "number" && opts.ocrConfidence < 0.35) {
    return {
      status: "uncertain",
      message:
        "Medicine name could not be identified confidently. Please retake a clearer image or search manually.",
      confidence: null,
      candidates: result.matches.map(toCandidate),
      method,
      steps,
      ocrText: [`Recognized text: "${recognized.slice(0, 120)}"`],
    };
  }

  if (result.status === "identified" || result.status === "ambiguous") {
    const top = result.matches[0];
    return {
      status: "identified",
      message:
        result.status === "ambiguous"
          ? "Several medicines match this text — please select the correct one below."
          : `Matched against the ${top.medicine.verification} database record.`,
      confidence: Math.round(top.score * 100) / 100,
      candidates: result.matches.map(toCandidate),
      method,
      steps,
      ocrText: [`Recognized text: "${recognized.slice(0, 120)}"`],
    };
  }

  return {
    status: "not_found",
    message:
      "No matching medicine found in the verified database. Check the spelling or try manual search. MedSafe never guesses an unidentified medicine.",
    confidence: null,
    candidates: [],
    method,
    steps,
    ocrText: [`Recognized text: "${recognized.slice(0, 120)}"`],
  };
}
