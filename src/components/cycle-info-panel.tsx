"use client";

import { useEffect, useState } from "react";
import { CalendarHeart, Save, Lock, Check } from "lucide-react";
import { Card } from "@/components/ui";

export function CycleInfoPanel() {
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("");
  const [length, setLength] = useState(28);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setEnabled(Boolean(d.user.cycle_enabled));
          setStart(d.user.cycle_start ?? "");
          setLength(d.user.cycle_length ?? 28);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const save = async () => {
    await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cycle_enabled: enabled,
        cycle_start: start || null,
        cycle_length: enabled ? Number(length) : null,
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <Card className="border-pink-100">
      <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
        <CalendarHeart size={15} className="text-pink-600" /> Optional cycle information
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Optional and private — stored only in your account to tailor awareness notes. MedSafe never infers medical
        conditions from it. {loaded ? "" : "(loading…)"}
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-4 w-4 accent-pink-600" />
        Share basic cycle info with CycleSafe
      </label>

      {enabled ? (
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600">Last period start date</label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600">Cycle length (days)</label>
            <input
              type="number"
              min={2}
              max={60}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-pink-400"
            />
          </div>
        </div>
      ) : null}

      <button
        onClick={save}
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700"
      >
        {saved ? <Check size={14} /> : <Save size={14} />} {saved ? "Saved" : "Save"}
      </button>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
        <Lock size={11} /> Delete this any time from your profile.
      </p>
    </Card>
  );
}
