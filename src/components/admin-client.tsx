"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Users, Pill, ScanLine, AlertTriangle, Flag, TrendingUp, Search, Plus, Pencil, Trash2, Check, X, FileText,
} from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { AdminDataTabs } from "@/components/admin-data-tabs";

type Stats = {
  users: number; medicines: number; verifiedMedicines: number; scans: number;
  redFlags: number; reports: number; openReports: number;
  topSearched: Array<{ name: string; count: number }>;
};

type AdminMed = {
  id: number; slug: string; name: string; brand_name: string | null; generic_name: string | null;
  category: string | null; verification: string; verified_by: string | null; last_updated: string;
  rx_required: number; drowsiness: number; ingredients: string | null;
};

type Report = {
  id: number; type: string; description: string; medicine_name: string | null; pharmacy: string | null;
  location: string | null; status: string; admin_notes: string | null; created_at: string;
};

type Tab = "overview" | "medicines" | "data" | "users" | "reports";

type AdminUser = {
  id: number; name: string; email: string; role: "user" | "admin"; created_at: string;
  active: number; scans: number; cabinet_items: number; reports: number;
};

const emptyForm = {
  id: 0, slug: "", name: "", brand_name: "", generic_name: "", form: "Tablet", strength: "",
  manufacturer: "", category: "", barcode: "", schedule_class: "", rx_required: false,
  uses: "", precautions: "", side_effects: "", storage: "", pack_expiry_hint: "",
  drowsiness: false, driving_warning: false, pregnancy_caution: true, breastfeeding_caution: true,
  menstrual_note: "", verification: "unverified" as "verified" | "unverified",
};

export function AdminClient({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [meds, setMeds] = useState<AdminMed[]>([]);
  const [medQuery, setMedQuery] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);

  const loadAll = useCallback(async () => {
    const [s, m, r] = await Promise.all([
      fetch("/api/admin/stats").then((x) => x.json()),
      fetch("/api/admin/medicines").then((x) => x.json()),
      fetch("/api/admin/reports").then((x) => x.json()),
    ]);
    setStats(s.error ? null : s);
    setMeds(m.medicines ?? []);
    setReports(r.reports ?? []);
  }, []);

  const loadUsers = useCallback(async () => {
    const u = await fetch("/api/admin/users").then((x) => x.json());
    setUsers(u.users ?? []);
  }, []);

  useEffect(() => {
    // Initial dashboard fetch after mount; setState happens asynchronously inside loadAll().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === "users") {
      // Async fetch after mount; setState resolves inside loadUsers().
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadUsers();
    }
  }, [tab, loadUsers]);

  const setUserActive = async (u: AdminUser, active: boolean) => {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id, active }),
    });
    const d = await res.json();
    if (!res.ok) { window.alert(d.error ?? "Action failed."); return; }
    await loadUsers();
  };

  const searchMeds = async (q: string) => {
    setMedQuery(q);
    const m = await fetch(`/api/admin/medicines?q=${encodeURIComponent(q)}`).then((x) => x.json());
    setMeds(m.medicines ?? []);
  };

  const saveMed = async () => {
    if (!form) return;
    setFormError(null);
    const payload = {
      ...form,
      id: form.id || undefined,
      brand_name: form.brand_name || null,
      generic_name: form.generic_name || null,
      manufacturer: form.manufacturer || null,
      category: form.category || null,
      barcode: form.barcode || null,
      schedule_class: form.schedule_class || null,
      storage: form.storage || null,
      menstrual_note: form.menstrual_note || null,
      pack_expiry_hint: form.pack_expiry_hint || null,
      uses: form.uses.split("\n").map((s) => s.trim()).filter(Boolean),
      precautions: form.precautions.split("\n").map((s) => s.trim()).filter(Boolean),
      side_effects: form.side_effects.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    const res = await fetch("/api/admin/medicines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormError(data.error ?? "Save failed.");
      return;
    }
    setForm(null);
    await loadAll();
  };

  const deleteMed = async (id: number) => {
    const res = await fetch(`/api/admin/medicines?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json();
      window.alert(d.error ?? "Delete failed");
      return;
    }
    await loadAll();
  };

  const toggleVerification = async (med: AdminMed) => {
    // Load the full record into the editor to flip verification (verified_by is stamped server-side).
    const res = await fetch(`/api/admin/medicines?q=${encodeURIComponent(med.name)}`);
    const d = await res.json();
    const full = (d.medicines ?? []).find((x: AdminMed) => x.id === med.id);
    setForm({
      ...emptyForm,
      id: med.id,
      slug: med.slug,
      name: med.name,
      brand_name: med.brand_name ?? "",
      generic_name: med.generic_name ?? "",
      form: "Tablet",
      strength: "",
      category: med.category ?? "",
      verification: med.verification === "verified" ? "unverified" : "verified",
      pregnancy_caution: true,
      breastfeeding_caution: true,
      uses: "",
      precautions: "",
      side_effects: "",
    });
    void full;
  };

  const updateReport = async (id: number, patch: { status?: string; admin_notes?: string }) => {
    await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    setNotesFor(null);
    setNotesText("");
    await loadAll();
  };

  const statCards = stats ? [
    { icon: Users, label: "Total Users", value: stats.users, tone: "text-navy-700 bg-navy-50" },
    { icon: Pill, label: "Total Medicines", value: stats.medicines, sub: `${stats.verifiedMedicines} verified`, tone: "text-teal-700 bg-teal-50" },
    { icon: ScanLine, label: "Total Scans", value: stats.scans, tone: "text-sky-700 bg-sky-50" },
    { icon: AlertTriangle, label: "Safety Alerts", value: stats.redFlags, sub: "orange/red rules", tone: "text-orange-700 bg-orange-50" },
    { icon: Flag, label: "Reports", value: stats.reports, sub: `${stats.openReports} open`, tone: "text-red-700 bg-red-50" },
  ] : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Admin Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Signed in as {adminName}</p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          {(["overview", "medicines", "data", "users", "reports"] as Tab[]).map((tb) => (
            <button key={tb} onClick={() => setTab(tb)}
              className={`rounded-lg px-4 py-2 capitalize transition ${tab === tb ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"}`}>
              {tb}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      {tab === "overview" ? (
        <div className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {statCards.map(({ icon: Icon, label, value, sub, tone }) => (
              <Card key={label}>
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}>
                  <Icon size={17} />
                </span>
                <p className="mt-2.5 text-2xl font-bold text-navy-900">{value ?? "—"}</p>
                <p className="text-xs font-medium text-slate-500">{label}{sub ? ` · ${sub}` : ""}</p>
              </Card>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                <TrendingUp size={15} className="text-teal-600" /> Most searched medicines
              </h2>
              <ul className="mt-3 space-y-2.5">
                {stats?.topSearched.map((s) => {
                  const max = Math.max(...(stats.topSearched.map((x) => x.count) ?? [1]), 1);
                  return (
                    <li key={s.name}>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                        <span>{s.name}</span><span>{s.count}</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-teal-500" style={{ width: `${(s.count / max) * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
                <Flag size={15} className="text-red-500" /> Latest reports
              </h2>
              {reports.slice(0, 4).map((r) => (
                <div key={r.id} className="mt-2.5 rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-2">
                    <Badge tone={r.status === "resolved" ? "teal" : r.status === "reviewing" ? "amber" : "slate"}>{r.status}</Badge>
                    <span className="text-xs font-semibold text-navy-900">#{r.id} {r.type.replace(/_/g, " ")}</span>
                    <span className="ml-auto text-xs text-slate-400">{r.created_at?.slice(0, 10)}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.description}</p>
                </div>
              ))}
              {reports.length === 0 ? <p className="mt-2 text-xs text-slate-400">No reports yet.</p> : null}
            </Card>
          </div>
        </div>
      ) : null}

      {/* Medicines management */}
      {tab === "medicines" ? (
        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-56">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={medQuery} onChange={(e) => searchMeds(e.target.value)} placeholder="Search medicines…"
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-500" />
            </div>
            <button
              onClick={() => setForm({ ...emptyForm })}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Plus size={15} /> Add medicine
            </button>
          </div>

          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">Medicine</th>
                  <th className="px-4 py-3">Ingredients</th>
                  <th className="px-4 py-3">Flags</th>
                  <th className="px-4 py-3">Verification</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {meds.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-navy-900">{m.name}</p>
                      <p className="text-xs text-slate-400">{m.slug} · updated {m.last_updated?.slice(0, 10)}</p>
                    </td>
                    <td className="max-w-52 px-4 py-3 text-xs text-slate-600">{m.ingredients ?? "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.rx_required ? <Badge tone="red">Rx</Badge> : null}
                        {m.drowsiness ? <Badge tone="amber">Drowsy</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={m.verification === "verified" ? "teal" : "amber"}>{m.verification}</Badge>
                      {m.verified_by ? <p className="mt-0.5 text-[11px] text-slate-400">by {m.verified_by}</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => toggleVerification(m)} title="Toggle verification"
                          className="rounded-lg p-2 text-teal-600 hover:bg-teal-50">
                          <Check size={15} />
                        </button>
                        <button onClick={() => setForm({ ...emptyForm, id: m.id, slug: m.slug, name: m.name, brand_name: m.brand_name ?? "", generic_name: m.generic_name ?? "", category: m.category ?? "", verification: m.verification as "verified" | "unverified", rx_required: Boolean(m.rx_required), drowsiness: Boolean(m.drowsiness) })}
                          title="Edit" className="rounded-lg p-2 text-navy-600 hover:bg-navy-50">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => deleteMed(m.id)} title="Delete" className="rounded-lg p-2 text-red-500 hover:bg-red-50">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Editor drawer */}
          {form ? (
            <div className="fixed inset-0 z-50 flex justify-end bg-navy-950/40 backdrop-blur-sm" onClick={() => setForm(null)}>
              <div className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-navy-900">{form.id ? `Edit: ${form.name}` : "Add medicine"}</h2>
                  <button onClick={() => setForm(null)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18} /></button>
                </div>

                <div className="mt-4 grid gap-3">
                  {([
                    ["name", "Name *"], ["slug", "Slug * (lowercase-with-dashes)"], ["brand_name", "Brand name"],
                    ["generic_name", "Generic name"], ["form", "Form"], ["strength", "Strength"],
                    ["manufacturer", "Manufacturer"], ["category", "Category"], ["barcode", "Barcode (EAN)"],
                    ["schedule_class", "Regulatory class"], ["storage", "Storage"],
                    ["pack_expiry_hint", "Pack expiry hint (YYYY-MM-DD)"],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-semibold text-navy-900">{label}</label>
                      <input
                        value={String(form[key] ?? "")}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                      />
                    </div>
                  ))}

                  {(["uses", "precautions", "side_effects"] as const).map((key) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs font-semibold text-navy-900">
                        {key.replace(/_/g, " ")} <span className="font-normal text-slate-400">(one per line)</span>
                      </label>
                      <textarea
                        rows={3}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                      />
                    </div>
                  ))}

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-navy-900">Menstrual / hormonal note</label>
                    <textarea
                      rows={2}
                      value={form.menstrual_note}
                      onChange={(e) => setForm({ ...form, menstrual_note: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500"
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-xl bg-slate-50 p-3.5">
                    {([
                      ["rx_required", "Prescription required"],
                      ["drowsiness", "Drowsiness flag"],
                      ["driving_warning", "Driving warning"],
                      ["pregnancy_caution", "Pregnancy caution"],
                      ["breastfeeding_caution", "Breastfeeding caution"],
                    ] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                        {label}
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-navy-900">Verification</label>
                    <select value={form.verification} onChange={(e) => setForm({ ...form, verification: e.target.value as "verified" | "unverified" })}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500">
                      <option value="verified">Verified (stamps your name as reviewer)</option>
                      <option value="unverified">Unverified</option>
                    </select>
                  </div>

                  {formError ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}

                  <div className="flex gap-2">
                    <button onClick={saveMed} className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
                      Save medicine
                    </button>
                    <button onClick={() => setForm(null)} className="rounded-xl border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50">
                      Cancel
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Note: editing via this drawer replaces list fields; use the full editor for ingredient mapping in a future iteration.
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Data governance: sources / ingredients / interactions / import / audit */}
      {tab === "data" ? <AdminDataTabs /> : null}

      {/* Reports review */}
      {tab === "users" ? (
        <Card className="mt-6 overflow-x-auto p-0">
          <div className="px-4 py-3">
            <h2 className="text-sm font-bold text-navy-900">Users ({users.length})</h2>
            <p className="text-xs text-slate-400">
              Deactivating a user signs them out immediately and blocks new sign-ins. Health data (cycle dates) is never shown here.
            </p>
          </div>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2">User</th><th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Scans</th><th className="px-4 py-2">Cabinet</th><th className="px-4 py-2">Reports</th>
                <th className="px-4 py-2">Joined</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <p className="font-semibold text-navy-900">{u.name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs uppercase text-slate-500">{u.role}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{u.scans}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{u.cabinet_items}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{u.reports}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{u.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <Badge tone={u.active ? "teal" : "red"}>{u.active ? "active" : "deactivated"}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {u.active ? (
                      <button onClick={() => setUserActive(u, false)} disabled={u.role === "admin"}
                        title={u.role === "admin" ? "Admin accounts cannot be deactivated here" : "Deactivate user"}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-30">
                        Deactivate
                      </button>
                    ) : (
                      <button onClick={() => setUserActive(u, true)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50">
                        Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 ? <tr><td colSpan={8} className="px-4 py-4 text-xs text-slate-400">No users registered yet.</td></tr> : null}
            </tbody>
          </table>
        </Card>
      ) : null}

      {tab === "reports" ? (
        <div className="mt-6 space-y-3">
          {reports.length === 0 ? <Card className="text-sm text-slate-500">No reports yet.</Card> : null}
          {reports.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-navy-900">#{r.id} · {r.type.replace(/_/g, " ")}</span>
                <Badge tone={r.status === "resolved" ? "teal" : r.status === "reviewing" ? "amber" : "slate"}>{r.status}</Badge>
                {r.medicine_name ? <Badge tone="navy">{r.medicine_name}</Badge> : null}
                {r.pharmacy ? <span className="text-xs text-slate-400">{r.pharmacy}{r.location ? ` · ${r.location}` : ""}</span> : null}
                <span className="ml-auto text-xs text-slate-400">{r.created_at?.slice(0, 16).replace("T", " ")}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{r.description}</p>
              {r.admin_notes ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Notes: {r.admin_notes}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                {["open", "reviewing", "resolved"].map((st) => (
                  <button key={st} onClick={() => updateReport(r.id, { status: st })}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                      r.status === st ? "bg-navy-900 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}>
                    {st}
                  </button>
                ))}
                <button
                  onClick={() => { setNotesFor(notesFor === r.id ? null : r.id); setNotesText(r.admin_notes ?? ""); }}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-navy-700 hover:bg-slate-50"
                >
                  <FileText size={12} /> {notesFor === r.id ? "Close notes" : "Add notes"}
                </button>
              </div>
              {notesFor === r.id ? (
                <div className="mt-2">
                  <textarea rows={2} value={notesText} onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Reviewer notes…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-500" />
                  <button onClick={() => updateReport(r.id, { admin_notes: notesText })}
                    className="mt-2 rounded-xl bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700">
                    Save notes
                  </button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
