"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/provider";
import {
  Package, Trash2, BellPlus, Bell, AlertTriangle, CalendarClock, Users, History, Plus, Check,
} from "lucide-react";
import { Card, Badge, LevelPill } from "@/components/ui";
import type { Level } from "@/lib/safety-labels";

const LEVEL_DICT_KEY: Record<Level, string> = {
  green: "safety.green",
  yellow: "safety.yellow",
  orange: "safety.orange",
  red: "safety.red",
};

type Ingredient = { id: number; name: string; strength: string | null };
type Warning = { code: string; level: Level; title: string; body: string };
type Reminder = { id: number; time_of_day: string; label: string | null; active: number };

type Item = {
  umId: number;
  medicine: { id: number; slug: string; name: string; brand_name: string | null; form: string | null; strength: string | null; manufacturer: string | null; verification: string };
  ingredients: Ingredient[];
  expiry: { state: "ok" | "near" | "expired" | "unknown"; date?: string; days?: number };
  warnings: Warning[];
  duplicates: Ingredient[];
  reminders: Reminder[];
};

type HistoryRow = { id: number; method: string; query: string | null; confidence: number | null; matched: number; created_at: string; medicine_name: string | null; slug: string | null };

type MedOption = { slug: string; name: string; generic_name: string | null; strength: string | null };

export function CabinetClient({ userName }: { userName: string }) {
  const { t } = useI18n();
  const [items, setItems] = useState<Item[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [options, setOptions] = useState<MedOption[]>([]);
  const [picked, setPicked] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [cab, hist, meds] = await Promise.all([
      fetch("/api/cabinet").then((r) => r.json()),
      fetch("/api/history").then((r) => r.json()),
      fetch("/api/medicines?limit=50").then((r) => r.json()),
    ]);
    setItems(cab.items ?? []);
    setHistory(hist.history ?? []);
    setOptions(meds.medicines ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial data fetch after mount; setState happens asynchronously inside load().
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const addItem = async () => {
    if (!picked) return;
    setAdding(true);
    await fetch("/api/cabinet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: picked }),
    });
    setPicked("");
    await load();
    setAdding(false);
  };

  const removeItem = async (umId: number) => {
    await fetch(`/api/cabinet?umId=${umId}`, { method: "DELETE" });
    await load();
  };

  const addReminder = async (umId: number) => {
    const time = window.prompt("Reminder time (HH:MM, 24h)", "08:00");
    if (!time || !/^\d{2}:\d{2}$/.test(time)) return;
    await fetch("/api/cabinet/reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ umId, time_of_day: time }),
    });
    await load();
  };

  const removeReminder = async (id: number) => {
    await fetch(`/api/cabinet/reminders?id=${id}`, { method: "DELETE" });
    await load();
  };

  const clearHistory = async () => {
    await fetch("/api/history", { method: "DELETE" });
    await load();
  };

  // Duplicate pairs across the whole cabinet
  const dupMap = new Map<number, Ingredient[]>();
  for (const it of items) if (it.duplicates.length > 0) dupMap.set(it.umId, it.duplicates);
  const hasDuplicates = dupMap.size > 0;

  const expiredCount = items.filter((i) => i.expiry.state === "expired").length;
  const nearCount = items.filter((i) => i.expiry.state === "near").length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">My Medicine Cabinet</h1>
          <p className="mt-1 text-sm text-slate-600">Hello {userName.split(" ")[0]} — track, compare and stay aware.</p>
        </div>
        <div className="flex items-center gap-2">
          {expiredCount > 0 ? <Badge tone="red">{expiredCount} expired</Badge> : null}
          {nearCount > 0 ? <Badge tone="amber">{nearCount} near expiry</Badge> : null}
          <Badge tone="teal">{items.length} items</Badge>
        </div>
      </div>

      {/* Duplicate ingredient alert */}
      {hasDuplicates ? (
        <div className="mt-5 animate-fade-up rounded-2xl border border-orange-200 bg-orange-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-orange-900">
            <AlertTriangle size={17} /> Duplicate Active Ingredient Detected
          </p>          <p className="mt-1.5 text-sm leading-relaxed text-orange-900/90">
            {items
              .filter((i) => i.duplicates.length > 0)
              .map((i) => `${i.medicine.name} ↔ ${i.duplicates.map((d) => d.name).join(", ")}`)
              .join(" · ")}
            {" "}{t("cabinet.duplicateBody")}
          </p>
        </div>
      ) : null}

      {/* Add medicine */}
      <Card className="mt-5">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Plus size={15} className="text-teal-600" /> Add medicine
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value)}
            className="min-w-56 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500"
          >
            <option value="">Select a medicine (demo database)…</option>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name} {o.strength ? `(${o.strength})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={addItem}
            disabled={!picked || adding}
            className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Tip: add both Dolo 650 and Calmol Plus (or Coldrid) to see the duplicate-ingredient detector in action.
        </p>
      </Card>

      {/* Items */}
      {loading ? (
        <Card className="mt-5 text-sm text-slate-500">Loading your cabinet…</Card>
      ) : items.length === 0 ? (
        <Card className="mt-5 text-sm text-slate-500">Your cabinet is empty. Add medicines above to track duplicates and expiry.</Card>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {items.map((it) => {
            const worst = it.warnings.reduce<Level>((acc, w) => {
              const rank: Record<Level, number> = { green: 0, yellow: 1, orange: 2, red: 3 };
              return rank[w.level] > rank[acc] ? w.level : acc;
            }, "green");
            return (
              <Card key={it.umId} className="animate-fade-up">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/medicines/${it.medicine.slug}`} className="text-sm font-bold text-navy-900 hover:text-teal-700">
                      {it.medicine.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {it.medicine.form ?? ""} {it.medicine.strength ? `· ${it.medicine.strength}` : ""} · {it.medicine.manufacturer ?? ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LevelPill level={worst} label={t(LEVEL_DICT_KEY[worst])} />
                    <button
                      onClick={() => removeItem(it.umId)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      title="Remove from cabinet"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {it.ingredients.map((ing) => (
                    <span
                      key={ing.id}
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        it.duplicates.some((d) => d.id === ing.id)
                          ? "border-orange-300 bg-orange-50 text-orange-800"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}
                    >
                      {ing.name} {ing.strength ?? ""}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                  <span className={`inline-flex items-center gap-1 font-medium ${
                    it.expiry.state === "expired" ? "text-red-700" : it.expiry.state === "near" ? "text-amber-700" : "text-slate-500"
                  }`}>
                    <CalendarClock size={13} />
                    {it.expiry.state === "expired"
                      ? t("cabinet.expiredLine").replace("{date}", it.expiry.date ?? "")
                      : it.expiry.state === "near"
                        ? t("cabinet.nearExpiryLine").replace("{date}", it.expiry.date ?? "")
                        : it.expiry.state === "ok"
                          ? t("cabinet.validUntil").replace("{date}", it.expiry.date ?? "")
                          : t("cabinet.noExpiry")}
                  </span>
                  {it.medicine.verification !== "verified" ? <Badge tone="amber">Unverified</Badge> : null}
                </div>

                {it.warnings.filter((w) => w.code !== "duplicate" || it.duplicates.length > 0).length > 0 ? (
                  <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                    {it.warnings
                      .filter((w) => w.code !== "duplicate" || it.duplicates.length > 0)
                      .slice(0, 3)
                      .map((w, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
                          <AlertTriangle size={12} className={`mt-0.5 shrink-0 ${w.level === "red" ? "text-red-500" : w.level === "orange" ? "text-orange-500" : "text-amber-500"}`} />
                          <span><strong className="text-navy-900">{w.title}:</strong> {w.body}</span>
                        </li>
                      ))}
                  </ul>
                ) : null}

                {/* Reminders */}
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs font-semibold text-slate-500">Reminders:</span>
                  {it.reminders.map((r) => (
                    <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                      <Bell size={10} /> {r.time_of_day}
                      <button onClick={() => removeReminder(r.id)} className="ml-0.5 text-teal-600 hover:text-red-500" aria-label="Delete reminder">×</button>
                    </span>
                  ))}
                  <button onClick={() => addReminder(it.umId)} className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-teal-300 hover:text-teal-700">
                    <BellPlus size={11} /> Add
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Family safety mode placeholder */}
      <Card className="mt-5 border-dashed">
        <p className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Users size={16} className="text-teal-600" /> Family Safety Mode
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Coming soon — manage medicines for family members with per-member views, shared expiry alerts and caregiver
          reminders.
        </p>
      </Card>

      {/* Scan history */}
      <Card className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
            <History size={15} className="text-teal-600" /> Scan history
          </h2>
          {history.length > 0 ? (
            <button onClick={clearHistory} className="text-xs font-medium text-slate-400 hover:text-red-600">
              Clear history
            </button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-slate-400">No scans yet. <Link href="/scan" className="text-teal-700 hover:underline">Try the scanner</Link>.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {history.slice(0, 8).map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-slate-700">
                  {h.slug ? (
                    <Link href={`/medicines/${h.slug}`} className="font-medium text-navy-900 hover:text-teal-700">
                      {h.medicine_name ?? h.query}
                    </Link>
                  ) : (
                    h.query ?? "—"
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 capitalize">{h.method}</span>
                  {h.matched ? `${Math.round((h.confidence ?? 0) * 100)}%` : "no match"}
                  <span>{h.created_at?.slice(0, 10)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          <Package size={11} /> Privacy-friendly: only the query and outcome are stored — images are never saved.
        </p>
      </Card>
    </div>
  );
}
