import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  parseCsv, parseExcel, parseJson, validateRecords, commitRecords, slugify,
  type ImportFormat, type RawRecord,
} from "@/lib/import/medicine-import";

/**
 * POST /api/admin/import?mode=preview|commit
 *
 * multipart/form-data:
 *   file   — .csv / .xlsx / .xls / .json upload  (or)
 *   json   — single manual record (medicine_name + source_name required)
 *
 * GET /api/admin/import — recent import history
 */

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const db = getDb();
  const history = db
    .prepare("SELECT * FROM import_history ORDER BY created_at DESC, id DESC LIMIT 25")
    .all();
  return NextResponse.json({ history });
}

function detectFormat(filename: string | null): ImportFormat | null {
  const f = (filename ?? "").toLowerCase();
  if (f.endsWith(".csv")) return "csv";
  if (f.endsWith(".xlsx") || f.endsWith(".xls")) return "excel";
  if (f.endsWith(".json")) return "json";
  return null;
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const mode = new URL(req.url).searchParams.get("mode") === "commit" ? "commit" : "preview";
  const contentType = req.headers.get("content-type") ?? "";

  let rows: RawRecord[] = [];
  let format: ImportFormat = "manual";
  let filename: string | null = null;
  let parseError: string | null = null;

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Attach a file field named 'file'." }, { status: 400 });
      }
      format = detectFormat(file.name) ?? (file.type.includes("sheet") ? "excel" : null) ?? "csv";
      filename = file.name;

      if (format === "excel") {
        rows = parseExcel(await file.arrayBuffer());
      } else if (format === "json") {
        rows = parseJson(await file.text());
      } else {
        rows = parseCsv(await file.text());
      }
    } else {
      // Manual single-record entry (JSON body)
      const body = (await req.json()) as Record<string, unknown>;
      rows = [body];
      format = "manual";
    }
  } catch (e) {
    parseError = e instanceof Error ? e.message : "Could not parse the uploaded file.";
  }

  if (parseError) {
    return NextResponse.json({ error: parseError }, { status: 400 });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "No records found in the upload." }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "Import is limited to 500 records per batch." }, { status: 400 });
  }

  const preview = validateRecords(rows);
  preview.format = format;

  if (mode === "preview") {
    return NextResponse.json({ preview });
  }

  const result = commitRecords(preview, user.email, filename, format);
  return NextResponse.json({ result });
}

// Manual-entry schema is documented here and enforced through the same validator:
// required: medicine_name, generic_name, active_ingredients, source_name,
//           source_url, last_updated (YYYY-MM-DD), verification_status
export const ManualEntryExample = {
  medicine_name: "Example",
  generic_name: "Paracetamol",
  active_ingredients: "Paracetamol 500 mg",
  source_name: "CDSCO",
  source_url: "https://example.gov.in/label",
  last_updated: "2026-01-15",
  verification_status: "verified",
};
