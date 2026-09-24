import Link from "next/link";
import { getDb } from "@/lib/db";
import { Badge, Card } from "@/components/ui";
import { Search } from "lucide-react";
import { MedicineSearchBox } from "@/components/medicine-search-box";

export const metadata = { title: "Medicine Database" };

// Always render fresh from the database — this page previously prerendered
// at build time, so admin imports never appeared on warm server instances.
export const dynamic = "force-dynamic";

type Row = {
  slug: string;
  name: string;
  brand_name: string | null;
  generic_name: string | null;
  form: string | null;
  strength: string | null;
  manufacturer: string | null;
  category: string | null;
  verification: string;
};

export default async function MedicinesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const db = getDb();
  const like = `%${q ?? ""}%`;
  const rows = (q ? (
    db.prepare(
      `SELECT slug, name, brand_name, generic_name, form, strength, manufacturer, category, verification
       FROM medicines WHERE name LIKE ? OR brand_name LIKE ? OR generic_name LIKE ? OR category LIKE ?
       ORDER BY CASE verification WHEN 'verified' THEN 0 ELSE 1 END, name`
    )
  ) : (
    db.prepare(
      `SELECT slug, name, brand_name, generic_name, form, strength, manufacturer, category, verification
       FROM medicines ORDER BY CASE verification WHEN 'verified' THEN 0 ELSE 1 END, name`
    )
  )).all(...(q ? [like, like, like, like] : [])) as Row[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="text-2xl font-bold text-navy-900">Medicine Database</h1>
      <p className="mt-1 text-sm text-slate-600">
        Demo dataset with clearly-marked verification status — not an official medical database.
      </p>

      <div className="mt-5 max-w-xl">
        <MedicineSearchBox initial={q ?? ""} />
      </div>

      {rows.length === 0 ? (
        <Card className="mt-6 text-sm text-slate-600">
          No medicines matched “{q}”. Try a shorter search term.
        </Card>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((m) => (
            <Link key={m.slug} href={`/medicines/${m.slug}`}>
              <Card className="h-full transition hover:border-teal-300 hover:shadow-[var(--shadow-soft)]">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-sm font-bold text-navy-900">{m.name}</h2>
                  <Badge tone={m.verification === "verified" ? "teal" : "amber"}>
                    {m.verification === "verified" ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">{m.generic_name ?? m.brand_name ?? "—"}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {m.form ? `${m.form}` : ""}{m.strength ? ` · ${m.strength}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">{m.manufacturer ?? ""}{m.category ? ` · ${m.category}` : ""}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
        <Search size={12} /> {rows.length} record{rows.length === 1 ? "" : "s"} shown · verified records first
      </p>
    </div>
  );
}
