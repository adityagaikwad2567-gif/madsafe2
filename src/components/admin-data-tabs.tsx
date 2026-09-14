"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Database, Upload, Check, X, History, Trash2, Plus, ShieldCheck, AlertOctagon, Download, FileSpreadsheet, FileJson, FileText,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";

/**
 * Admin data-governance tabs: Sources, Ingredients, Interactions, Import, Audit.
 * Self-contained: fetches its own data and posts to /api/admin/data + /api/admin/import.
 */

type Section = "sources" | "ingredients" | "interactions" | "import" | "audit";

type SourceRow = {
  id: number; title: string; publisher: string | null; url: string | null; kind: string;
  document_name: string | null; publication_date: string | null; last_checked: string | null;
  verification_status: string; medicine_count: number;
};
type IngredientRow = { id: number; name: string; description: string | null; uniq_name: string; medicine_count: number };
type InteractionRow = {
  id: number; name_a: string; name_b: string; severity: string; interaction_type: string | null;
  description: string; source_title: string | null;
};
type AuditRow = { id: number; actor: string; action: string; entity: string; entity_id: string | null; details: string | null; created_at: string };
type ImportRow = {
  id: number; actor: string; format: string; filename: string | null; total_rows: number;
  imported: number; updated: number; rejected: number; errors_json: string; created_at: string;
};
type PreviewRecord = { row: number; status: string; existingId?: number; data: { name: string; slug: string; verification: string; source_id: number | null; ingredients: Array<{ name: string; strength: string | null }> } };
type PreviewPayload = { format: string; total: number; valid: number; duplicates: number; rejected: number; records: PreviewRecord[]; errors: Array<{ row: number; field: string; message: string }> };

export function AdminDataTabs() {
  const [section, setSection] = useState<Section>("sources");
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [interactions, setInteractions] = useState<InteractionRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  // import state
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    const [s, i, x, a] = await Promise.all([
      fetch("/api/admin/data?entity=sources").then((r) => r.json()),
      fetch("/api/admin/data?entity=ingredients").then((r) => r.json()),
      fetch("/api/admin/data?entity=interactions").then((r) => r.json()),
      fetch("/api/admin/data?entity=audit").then((r) => r.json()),
    ]);
    setSources(s.sources ?? []);
    setIngredients(i.ingredients ?? []);
    setInteractions(x.interactions ?? []);
    setAudit(a.audit ?? []);
    setImports(a.imports ?? []);
  }, []);

  useEffect(() => {
    // Initial governance-data fetch after mount; setState happens inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const flash = (m: string) => {
    setMsg(m);
    setTimeout(() => setMsg(null), 3500);
  };

  // ── sources actions ──
  const addSource = async () => {
    const title = window.prompt("Source title (e.g. 'CDSCO consumer label — Cetirizine')");
    if (!title) return;
    const url = window.prompt("Source URL", "https://");
    const doc = window.prompt("Document reference (if no URL)", "");
    if (!url || url === "https://") {
      if (!doc) return flash("A source needs a URL or a document reference.");
    }
    const res = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "sources", title, url: url && url !== "https://" ? url : null, document_name: doc || null }),
    });
    const d = await res.json();
    flash(res.ok ? "Source added (status: pending — verify after checking)." : d.error ?? "Failed");
    await load();
  };

  const verifySource = async (s: SourceRow, status: "verified" | "rejected") => {
    await fetch("/api/admin/data", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "sources", id: s.id, verification_status: status, last_checked: new Date().toISOString().slice(0, 10) }),
    });
    flash(`Source marked ${status}.`);
    await load();
  };

  const deleteSource = async (s: SourceRow) => {
    const res = await fetch(`/api/admin/data?entity=sources&id=${s.id}`, { method: "DELETE" });
    const d = await res.json();
    flash(res.ok ? "Source deleted." : d.error ?? "Failed");
    await load();
  };

  // ── ingredients actions ──
  const addIngredient = async () => {
    const name = window.prompt("Ingredient name (e.g. 'Paracetamol')");
    if (!name) return;
    const description = window.prompt("Short factual description (optional, from a source)", "");
    const res = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "ingredients", name, description: description || null }),
    });
    const d = await res.json();
    flash(res.ok ? "Ingredient added." : d.error ?? "Failed");
    await load();
  };

  const deleteIngredient = async (i: IngredientRow) => {
    const res = await fetch(`/api/admin/data?entity=ingredients&id=${i.id}`, { method: "DELETE" });
    const d = await res.json();
    flash(res.ok ? "Ingredient deleted." : d.error ?? "Failed");
    await load();
  };

  // ── interactions actions ──
  const addInteraction = async () => {
    const aName = window.prompt("Ingredient A name (must exist, e.g. 'Ibuprofen')");
    if (!aName) return;
    const bName = window.prompt("Ingredient B name (must exist)");
    if (!bName) return;
    const a = ingredients.find((i) => i.name.toLowerCase() === aName.toLowerCase());
    const b = ingredients.find((i) => i.name.toLowerCase() === bName.toLowerCase());
    if (!a || !b) return flash("Both ingredients must already exist — add them first.");
    const sourceId = Number(window.prompt(`Source id for this interaction (from Sources tab, e.g. ${sources[0]?.id ?? "?"})`, String(sources[0]?.id ?? "")));
    if (!Number.isInteger(sourceId) || sourceId <= 0) return flash("A valid source id is required — interactions must cite a source.");
    const description = window.prompt("Interaction warning message (from the source document)");
    if (!description) return;
    const severity = window.prompt("Severity: caution | orange | red", "caution") ?? "caution";
    const res = await fetch("/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "interactions", ingredient_a: a.id, ingredient_b: b.id, severity, description, source_id: sourceId }),
    });
    const d = await res.json();
    flash(res.ok ? "Interaction added." : d.error ?? "Failed");
    await load();
  };

  const deleteInteraction = async (x: InteractionRow) => {
    await fetch(`/api/admin/data?entity=interactions&id=${x.id}`, { method: "DELETE" });
    flash("Interaction deleted.");
    await load();
  };

  // ── import flow ──
  const downloadErrorReport = () => {
    const errors = preview?.errors ?? [];
    if (errors.length === 0) return;
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
      `# MedSafe import error report — ${new Date().toISOString()}`,
      `# ${preview?.total ?? 0} rows · ${preview?.valid ?? 0} valid · ${preview?.rejected ?? 0} rejected`,
      "row,field,message",
      ...errors.map((e) => [esc(e.row), esc(e.field), esc(e.message)].join(",")),
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `medsafe-import-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const doPreview = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return flash("Choose a CSV / Excel / JSON file first.");
    setImporting(true);
    setPreview(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/import?mode=preview", { method: "POST", body: fd });
    const d = await res.json();
    setImporting(false);
    if (!res.ok) return flash(d.error ?? "Preview failed");
    setPreview(d.preview);
  };

  const doCommit = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !preview) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/import?mode=commit", { method: "POST", body: fd });
    const d = await res.json();
    setImporting(false);
    if (!res.ok) return flash(d.error ?? "Import failed");
    flash(`Imported ${d.result.imported} new, updated ${d.result.updated}, rejected ${d.result.rejected}.`);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
    await load();
  };

  const TABS: Array<{ id: Section; label: string }> = [
    { id: "sources", label: "Sources" },
    { id: "ingredients", label: "Ingredients" },
    { id: "interactions", label: "Interactions" },
    { id: "import", label: "Import" },
    { id: "audit", label: "Audit log" },
  ];

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 text-xs font-semibold">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setSection(t.id)}
              className={`rounded-lg px-3 py-1.5 transition ${section === t.id ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"}`}>
              {t.label}
            </button>
          ))}
        </div>
        {msg ? <span className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800">{msg}</span> : null}
      </div>

      {/* ── Sources ── */}
      {section === "sources" ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-bold text-navy-900">Sources ({sources.length})</h2>
            <button onClick={addSource} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
              <Plus size={13} /> Add source
            </button>
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">Title</th><th className="px-4 py-2">Document / URL</th>
                <th className="px-4 py-2">Used by</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {sources.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-navy-900">{s.title}</p>
                    <p className="text-xs text-slate-400">{s.publisher ?? ""} · {s.kind}</p>
                  </td>
                  <td className="max-w-64 px-4 py-2.5 text-xs text-slate-500">
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">{s.url}</a> : s.document_name ?? "—"}
                    {s.last_checked ? <span className="block text-[11px] text-slate-400">checked {s.last_checked}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{s.medicine_count}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={s.verification_status === "verified" ? "teal" : s.verification_status === "rejected" ? "red" : "amber"}>{s.verification_status}</Badge>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => verifySource(s, "verified")} title="Mark verified" className="rounded-lg p-2 text-teal-600 hover:bg-teal-50"><ShieldCheck size={14} /></button>
                      <button onClick={() => verifySource(s, "rejected")} title="Mark rejected" className="rounded-lg p-2 text-amber-600 hover:bg-amber-50"><X size={14} /></button>
                      <button onClick={() => deleteSource(s)} disabled={s.medicine_count > 0} title={s.medicine_count > 0 ? "Cited by medicines" : "Delete"} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* ── Ingredients ── */}
      {section === "ingredients" ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-bold text-navy-900">Active ingredients ({ingredients.length})</h2>
            <button onClick={addIngredient} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
              <Plus size={13} /> Add ingredient
            </button>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">Name</th><th className="px-4 py-2">Description (from source)</th>
                <th className="px-4 py-2">Used by</th><th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {ingredients.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold text-navy-900">{i.name}</td>
                  <td className="max-w-96 px-4 py-2.5 text-xs text-slate-500">{i.description ?? <span className="italic">No description on file</span>}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{i.medicine_count}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end">
                      <button onClick={() => deleteIngredient(i)} disabled={i.medicine_count > 0} title={i.medicine_count > 0 ? "Linked to medicines" : "Delete"} className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : null}

      {/* ── Interactions ── */}
      {section === "interactions" ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-sm font-bold text-navy-900">Documented interactions ({interactions.length})</h2>
            <button onClick={addInteraction} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">
              <Plus size={13} /> Add interaction
            </button>
          </div>
          {interactions.length === 0 ? <p className="px-4 pb-4 text-xs text-slate-400">No interaction records yet.</p> : null}
          <ul className="divide-y divide-slate-50">
            {interactions.map((x) => (
              <li key={x.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-navy-900">
                    {x.name_a} + {x.name_b}
                    <Badge tone={x.severity === "red" ? "red" : x.severity === "orange" ? "amber" : "slate"}>{x.severity}</Badge>
                    {x.interaction_type ? <span className="ml-1 text-xs text-slate-400">({x.interaction_type})</span> : null}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{x.description}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">Source: {x.source_title ?? "—"}</p>
                </div>
                <button onClick={() => deleteInteraction(x)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* ── Import ── */}
      {section === "import" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card>
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900"><Upload size={15} className="text-teal-600" /> Import medicines (CSV / Excel / JSON)</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              Required per record: <strong>medicine_name</strong>, <strong>generic_name</strong>, <strong>active_ingredients</strong>,{" "}
              <strong>source_name</strong> + <strong>source_url</strong>, <strong>last_updated</strong> (YYYY-MM-DD) and{" "}
              <strong>verification_status</strong>. Incomplete records are rejected, never guessed.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-navy-900">Download Import Template:</span>
              <a href="/api/admin/import/template?format=csv" download className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                <FileText size={13} /> medicines.csv
              </a>
              <a href="/api/admin/import/template?format=json" download className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                <FileJson size={13} /> medicines.json
              </a>
              <a href="/api/admin/import/template?format=xlsx" download className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-800 hover:bg-teal-100">
                <FileSpreadsheet size={13} /> medicines.xlsx
              </a>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" className="mt-3 block w-full rounded-xl border border-slate-200 p-2 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-teal-800" />
            <div className="mt-3 flex gap-2">
              <button onClick={doPreview} disabled={importing} className="rounded-xl bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800 disabled:opacity-50">
                {importing ? "Working…" : "1. Preview"}
              </button>
              <button onClick={doCommit} disabled={importing || !preview || preview.valid === 0} className="rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                2. Confirm import
              </button>
            </div>
          </Card>

          {preview ? (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-navy-900">
                  Preview — {preview.total} row(s): {preview.valid} ok · {preview.duplicates} update · {preview.rejected} rejected
                </h2>
                {preview.errors.length > 0 ? (
                  <button onClick={downloadErrorReport} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100">
                    <Download size={13} /> Error report ({preview.errors.length})
                  </button>
                ) : null}
              </div>
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
                {preview.records.map((r) => (
                  <li key={r.row} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <Badge tone={r.status === "duplicate_update" ? "amber" : "teal"}>{r.status === "duplicate_update" ? "update" : "new"}</Badge>
                    <span className="font-medium text-navy-900">{r.data.name}</span>
                    <span className="text-slate-400">{r.data.ingredients.map((i) => i.name).join(" + ") || "no ingredients"}</span>
                  </li>
                ))}
                {preview.errors.map((e, idx) => (
                  <li key={`e${idx}`} className="flex items-start gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-red-700">
                    <AlertOctagon size={12} className="mt-0.5 shrink-0" />
                    <span>
                      Row {e.row}: <strong>{e.field}</strong> — {e.message}
                      <span className="block text-[11px] text-red-500">This record will be rejected.</span>
                    </span>
                  </li>
                ))}
              </ul>
              {preview.valid === 0 ? (
                <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                  No valid rows — “Confirm import” stays disabled. Fix the errors and preview again.
                </p>
              ) : (
                <p className="mt-2 text-[11px] text-slate-400">Nothing is written until you press “Confirm import”. Rejected rows are skipped.</p>
              )}
            </Card>
          ) : (
            <Card className="border-dashed">
              <p className="text-xs leading-relaxed text-slate-500">
                <strong className="text-navy-900">Validation rules:</strong> medicine_name · generic_name · active_ingredients · source_name + source_url ·
                last_updated (YYYY-MM-DD) · verification_status (verified/unverified) are all required; data_confidence ∈ high/medium/low if provided.
                Max 500 rows per batch. Duplicate detection by slug, barcode or name+strength+form — duplicates update the existing record.
              </p>
            </Card>
          )}

          <Card className="lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900"><History size={14} className="text-teal-600" /> Import history</h2>
            {imports.length === 0 ? <p className="mt-2 text-xs text-slate-400">No imports yet.</p> : (
              <table className="mt-2 w-full text-xs">
                <thead><tr className="border-b border-slate-100 text-left uppercase tracking-wide text-slate-400">
                  <th className="py-1.5">When</th><th>By</th><th>File</th><th>Format</th><th>New</th><th>Updated</th><th>Rejected</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-50">
                  {imports.map((h) => (
                    <tr key={h.id}>
                      <td className="py-1.5 text-slate-500">{h.created_at?.slice(0, 16).replace("T", " ")}</td>
                      <td>{h.actor}</td><td className="max-w-40 truncate">{h.filename ?? "manual"}</td><td>{h.format}</td>
                      <td className="font-semibold text-teal-700">{h.imported}</td><td className="font-semibold text-amber-700">{h.updated}</td>
                      <td className="font-semibold text-red-600">{h.rejected}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      ) : null}

      {/* ── Audit log ── */}
      {section === "audit" ? (
        <Card className="mt-4 overflow-x-auto p-0">
          <div className="px-4 py-3">
            <h2 className="text-sm font-bold text-navy-900">Audit log (latest {audit.length})</h2>
            <p className="text-xs text-slate-400">Every admin data mutation is recorded with actor, action and details.</p>
          </div>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">When</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Entity</th><th className="px-4 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {audit.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{a.created_at?.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{a.actor}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-navy-900">{a.action}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{a.entity}#{a.entity_id}</td>
                  <td className="max-w-72 truncate px-4 py-2 font-mono text-[11px] text-slate-400">{a.details ?? "—"}</td>
                </tr>
              ))}
              {audit.length === 0 ? <tr><td colSpan={5} className="px-4 py-4 text-xs text-slate-400">No entries yet.</td></tr> : null}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
