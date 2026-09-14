import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildTemplateCsv, buildTemplateJson, buildTemplateXlsx } from "@/lib/import/template";

/**
 * GET /api/admin/import/template?format=csv|json|xlsx
 *
 * Downloadable import template for the admin dashboard ("Download Import
 * Template" buttons on the Import tab). All three formats are generated from
 * one shared definition (src/lib/import/template.ts) so they never drift.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const format = (new URL(req.url).searchParams.get("format") ?? "csv").toLowerCase();

  if (format === "json") {
    return new NextResponse(buildTemplateJson(), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="medicines.json"',
      },
    });
  }

  if (format === "xlsx") {
    return new NextResponse(buildTemplateXlsx() as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="medicines.xlsx"',
      },
    });
  }

  if (format !== "csv") {
    return NextResponse.json({ error: "Unsupported format. Use csv, json or xlsx." }, { status: 400 });
  }

  return new NextResponse(buildTemplateCsv(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="medicines.csv"',
    },
  });
}
