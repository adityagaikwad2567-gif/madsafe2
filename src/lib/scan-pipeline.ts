import { getDb } from "@/lib/db";

/**
 * Scan identification pipeline.
 *
 * In production this stage would call an OCR engine (e.g. Google Vision / Tesseract)
 * and a barcode decoder (e.g. ZXing) — see README > Future features.
 * For the prototype we simulate OCR/barcode and resolve against the medicines
 * table using token-overlap scoring with honest, never-100% confidence.
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
  confidence: number | null; // 0..1, always < 1 in demo mode
  candidates: ScanCandidate[];
  method: "camera" | "upload" | "barcode" | "manual" | "voice" | "demo";
  steps: ScanStep[];
  ocrText: string[];
  demoNote?: string;
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
  const med = db
    .prepare(
      "SELECT slug, name, brand_name, generic_name, manufacturer, strength FROM medicines WHERE barcode = ?"
    )
    .get(code.trim()) as ScanCandidate | undefined;

  const steps = buildSteps(5);
  if (med) {
    return {
      status: "identified",
      message: "Barcode matched a verified medicine record.",
      confidence: 0.97,
      candidates: [med],
      method: "barcode",
      steps,
      ocrText: [`EAN-13: ${code.trim()}`],
    };
  }
  return {
    status: "not_found",
    message: "Barcode not found in the demo database. Try manual search or add the medicine via the admin panel.",
    confidence: null,
    candidates: [],
    method: "barcode",
    steps,
    ocrText: [`EAN-13: ${code.trim()}`],
  };
}

export function identifyByText(
  query: string,
  method: ScanResult["method"],
  opts?: { simulateUncertain?: boolean }
): ScanResult {
  const db = getDb();
  const tokens = tokenize(query);
  const steps = buildSteps(5);

  if (tokens.length === 0) {
    return {
      status: "uncertain",
      message: "Medicine could not be confidently identified. Please upload a clearer image or search manually.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: [],
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

  // Demo escape hatch: OCR produced unreadable text → honest uncertainty
  if (opts?.simulateUncertain || /blurry|unclear|unclear|unreadable/i.test(query)) {
    return {
      status: "uncertain",
      message: "Medicine could not be confidently identified. Please upload a clearer image or search manually.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: ["Recognised text: '?????' (low quality image)"],
      demoNote: "Prototype OCR fallback — no identification is forced when the image quality is poor.",
    };
  }

  if (scored.length === 0 || scored[0].score < 0.35) {
    return {
      status: "not_found",
      message: "No matching medicine found in the demo database. Try a different name or spelling.",
      confidence: null,
      candidates: [],
      method,
      steps,
      ocrText: [`Recognised text: "${query}"`],
    };
  }

  const top = scored[0];
  const capped = top.med.verification === "verified" ? Math.min(0.92, top.score) : Math.min(0.55, top.score);
  return {
    status: "identified",
    message: `Matched against the ${top.med.verification} demo database record.`,
    confidence: Math.round(capped * 100) / 100,
    candidates: scored.map((s) => s.med),
    method,
    steps,
    ocrText: [`Recognised text: "${query}"`],
    demoNote: "Prototype OCR simulation — production build will call a real OCR/barcode service.",
  };
}
