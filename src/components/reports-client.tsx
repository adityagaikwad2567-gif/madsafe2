"use client";

import { useEffect, useState } from "react";
import { Flag, CheckCircle2, Send, ShieldAlert, FileText } from "lucide-react";
import { Card, Badge } from "@/components/ui";

const TYPES = [
  { id: "expired", label: "Expired medicine", desc: "Medicine sold or used after its expiry date." },
  { id: "damaged_packaging", label: "Damaged packaging", desc: "Broken seal, torn strip, crushed pack." },
  { id: "incorrect_label", label: "Incorrect label", desc: "Label details look wrong or mismatched." },
  { id: "suspicious_sale", label: "Suspicious medicine sale", desc: "Prescription-only medicine sold without prescription." },
  { id: "info_mismatch", label: "Possible information mismatch", desc: "Contents differ from what the label claims." },
] as const;

type MyReport = { id: number; type: string; status: string; description: string; created_at: string; admin_notes: string | null };

export function ReportsClient() {
  const [type, setType] = useState<string>("expired");
  const [description, setDescription] = useState("");
  const [medicineName, setMedicineName] = useState("");
  const [pharmacy, setPharmacy] = useState("");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<MyReport[]>([]);

  const loadMine = () =>
    fetch("/api/reports")
      .then((r) => r.json())
      .then((d) => setMine(d.reports ?? []))
      .catch(() => {});

  useEffect(() => {
    loadMine();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          description,
          medicine_name: medicineName || undefined,
          pharmacy: pharmacy || undefined,
          location: location || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not submit the report.");
        return;
      }
      setDone(data.reportId);
      setDescription("");
      setMedicineName("");
      setPharmacy("");
      setLocation("");
      loadMine();
    } finally {
      setBusy(false);
    }
  };

  const statusTone = (s: string): "teal" | "amber" | "slate" =>
    s === "resolved" ? "teal" : s === "reviewing" ? "amber" : "slate";

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
          <Flag size={18} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Report a Safety Issue</h1>
          <p className="text-sm text-slate-600">Anonymous, free-text friendly, reviewed by admins.</p>
        </div>
      </div>

      {done ? (
        <div className="mt-5 animate-fade-up rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-teal-900">
            <CheckCircle2 size={17} className="text-teal-600" /> Report #{done} submitted.
          </p>
          <p className="mt-1 text-sm text-teal-800">
            Thank you — it will be reviewed for awareness and appropriate follow-up.
          </p>
        </div>
      ) : null}

      <Card className="mt-5">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-navy-900">What did you notice?</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {TYPES.map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setType(t.id)}
                  className={`rounded-xl border px-3.5 py-2.5 text-left transition ${
                    type === t.id ? "border-teal-500 bg-teal-50" : "border-slate-200 hover:border-teal-200"
                  }`}
                >
                  <span className="block text-sm font-semibold text-navy-900">{t.label}</span>
                  <span className="block text-xs text-slate-500">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-navy-900">
              Describe the issue <span className="text-slate-400">(min. 10 characters)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              required
              minLength={10}
              maxLength={2000}
              placeholder="What happened, where and when? Avoid personal medical details."
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-navy-900">Medicine name <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={medicineName} onChange={(e) => setMedicineName(e.target.value)} maxLength={120}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-navy-900">Pharmacy / seller <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={pharmacy} onChange={(e) => setPharmacy(e.target.value)} maxLength={120}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-navy-900">Area / city <span className="font-normal text-slate-400">(optional)</span></label>
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={120}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500" />
            </div>
          </div>

          {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button
            type="submit"
            disabled={busy || description.trim().length < 10}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            <Send size={14} /> Submit anonymously
          </button>
        </form>
      </Card>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
        <p className="flex items-start gap-2">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-navy-500" />
          <span>
            Reports are reviewed for awareness and appropriate follow-up. MedSafe does not independently declare a
            medicine, pharmacy or seller illegal.
          </span>
        </p>
      </div>

      {mine.length > 0 ? (
        <Card className="mt-5">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <FileText size={15} className="text-teal-600" /> Your reports
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">Reports submitted while logged in appear here.</p>
          <ul className="mt-3 divide-y divide-slate-100">
            {mine.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-navy-900">#{r.id} · {TYPES.find((t) => t.id === r.type)?.label ?? r.type}</span>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  <span className="ml-auto text-xs text-slate-400">{r.created_at?.slice(0, 10)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600">{r.description}</p>
                {r.admin_notes ? <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-500">Reviewer note: {r.admin_notes}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
