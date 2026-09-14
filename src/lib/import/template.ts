import * as XLSX from "xlsx";

/**
 * Downloadable import templates (admin dashboard → Import tab).
 *
 * Single source of truth for the template columns, example rows and per-field
 * guidance, so the CSV, JSON and Excel downloads can never drift apart.
 * Column order matches the published template spec exactly.
 */

export const TEMPLATE_HEADERS = [
  "medicine_name",
  "brand_name",
  "generic_name",
  "active_ingredients",
  "strength",
  "dosage_form",
  "manufacturer",
  "category",
  "uses",
  "precautions",
  "side_effects",
  "contraindications",
  "prescription_required",
  "schedule_information",
  "drowsiness_warning",
  "driving_warning",
  "pregnancy_information",
  "breastfeeding_information",
  "menstrual_information",
  "storage",
  "source_name",
  "source_url",
  "last_updated",
  "verification_status",
] as const;

export type TemplateRecord = Record<(typeof TEMPLATE_HEADERS)[number], string>;

/**
 * Two clearly-fictional example rows showing the expected formats
 * (semicolon-separated lists, true/false flags, YYYY-MM-DD dates).
 * Admins delete them before importing real data.
 */
export const TEMPLATE_EXAMPLES: TemplateRecord[] = [
  {
    medicine_name: "Example Paracetamol 500",
    brand_name: "Example Para",
    generic_name: "Paracetamol",
    active_ingredients: "Paracetamol 500 mg",
    strength: "500 mg",
    dosage_form: "Tablet",
    manufacturer: "Example Pharmaceuticals Ltd",
    category: "Analgesic / Antipyretic",
    uses: "Relief of mild to moderate pain; Reducing fever",
    precautions: "Do not exceed the labelled dose; Avoid other paracetamol-containing medicines",
    side_effects: "Nausea; Rash",
    contraindications: "Liver disease; Known paracetamol allergy",
    prescription_required: "false",
    schedule_information: "OTC",
    drowsiness_warning: "false",
    driving_warning: "false",
    pregnancy_information: "Consult a doctor before use",
    breastfeeding_information: "Consult a doctor before use",
    menstrual_information: "",
    storage: "Store below 30 C",
    source_name: "CDSCO consumer label reference",
    source_url: "https://cdsco.gov.in/",
    last_updated: "2026-01-15",
    verification_status: "verified",
  },
  {
    medicine_name: "Example Ibuprofen 200",
    brand_name: "Example IBU",
    generic_name: "Ibuprofen",
    active_ingredients: "Ibuprofen 200 mg",
    strength: "200 mg",
    dosage_form: "Tablet",
    manufacturer: "Example Pharma",
    category: "NSAID",
    uses: "Pain relief; Fever; Inflammation",
    precautions: "Take after food; Avoid with stomach ulcers",
    side_effects: "Stomach upset; Heartburn",
    contraindications: "Active peptic ulcer; Severe kidney disease",
    prescription_required: "false",
    schedule_information: "OTC",
    drowsiness_warning: "false",
    driving_warning: "false",
    pregnancy_information: "Avoid in the third trimester without a doctor",
    breastfeeding_information: "Consult a doctor before use",
    menstrual_information: "",
    storage: "Store below 30 C",
    source_name: "MIMS India monograph",
    source_url: "https://www.mims.com/",
    last_updated: "2026-02-01",
    verification_status: "unverified",
  },
];

/** Per-field guidance, embedded as a second sheet in the Excel template. */
export const TEMPLATE_FIELD_NOTES: Array<{ field: string; required: string; guidance: string }> = [
  { field: "medicine_name", required: "required", guidance: "Product name exactly as printed on the pack." },
  { field: "brand_name", required: "optional", guidance: "Brand / marketing name if different from medicine_name." },
  { field: "generic_name", required: "required", guidance: "Generic (INN) name, e.g. Paracetamol." },
  { field: "active_ingredients", required: "required", guidance: "Semicolon-separated 'Ingredient strength' entries, e.g. 'Paracetamol 500 mg; Caffeine 30 mg'." },
  { field: "strength", required: "optional", guidance: "Pack strength, e.g. 500 mg." },
  { field: "dosage_form", required: "optional", guidance: "Tablet / Capsule / Syrup / Injection / Drops / Cream…" },
  { field: "manufacturer", required: "optional", guidance: "Manufacturer as printed on the pack — copy it, never guess." },
  { field: "category", required: "optional", guidance: "Therapeutic category, e.g. Analgesic / Antipyretic." },
  { field: "uses", required: "optional", guidance: "Semicolon-separated label uses, copied from the source document. Leave empty if not stated." },
  { field: "precautions", required: "optional", guidance: "Semicolon-separated label precautions. Leave empty if not stated." },
  { field: "side_effects", required: "optional", guidance: "Semicolon-separated documented side effects. Leave empty if not stated." },
  { field: "contraindications", required: "optional", guidance: "Semicolon-separated documented contraindications. Leave empty if not stated." },
  { field: "prescription_required", required: "optional", guidance: "true / false." },
  { field: "schedule_information", required: "optional", guidance: "Regulatory schedule exactly as printed on the label (e.g. OTC, Rx, H, H1, X). Never invent." },
  { field: "drowsiness_warning", required: "optional", guidance: "true / false — label warns 'may cause drowsiness'." },
  { field: "driving_warning", required: "optional", guidance: "true / false — label warns about driving / machinery." },
  { field: "pregnancy_information", required: "optional", guidance: "Free text copied from the label or monograph. Leave empty if not stated — never guess." },
  { field: "breastfeeding_information", required: "optional", guidance: "Free text copied from the label or monograph. Leave empty if not stated — never guess." },
  { field: "menstrual_information", required: "optional", guidance: "Free text copied from the label or monograph. Leave empty if not stated — never guess." },
  { field: "storage", required: "optional", guidance: "Label storage instruction, e.g. 'Store below 30 C'." },
  { field: "source_name", required: "required", guidance: "Name of the authority / document the data was copied from, e.g. 'CDSCO consumer label'." },
  { field: "source_url", required: "required", guidance: "https:// link to the exact source document." },
  { field: "last_updated", required: "required", guidance: "YYYY-MM-DD — the date this record was last checked against the source." },
  { field: "verification_status", required: "required", guidance: "verified (a reviewer has checked the source) or unverified." },
];

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildTemplateCsv(): string {
  const lines = [
    TEMPLATE_HEADERS.join(","),
    ...TEMPLATE_EXAMPLES.map((row) => TEMPLATE_HEADERS.map((h) => csvEscape(row[h])).join(",")),
  ];
  return lines.join("\r\n") + "\r\n";
}

export function buildTemplateJson(): string {
  return JSON.stringify(TEMPLATE_EXAMPLES, null, 2) + "\n";
}

/** Excel workbook: "medicines" sheet (header + examples) plus a "field notes" sheet. */
export function buildTemplateXlsx(): Uint8Array {
  const header = [...TEMPLATE_HEADERS];
  const aoa: string[][] = [header, ...TEMPLATE_EXAMPLES.map((row) => header.map((h) => row[h]))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = header.map((h) => ({ wch: Math.min(42, Math.max(14, h.length + 8)) }));

  const notesWs = XLSX.utils.aoa_to_sheet([
    ["field", "required", "guidance"],
    ...TEMPLATE_FIELD_NOTES.map((n) => [n.field, n.required, n.guidance]),
  ]);
  notesWs["!cols"] = [{ wch: 26 }, { wch: 10 }, { wch: 96 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "medicines");
  XLSX.utils.book_append_sheet(wb, notesWs, "field notes");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(out);
}
