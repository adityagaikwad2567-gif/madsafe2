"use client";

import { useState } from "react";
import { UserRound, Save, Check, Trash2, ShieldCheck, Languages } from "lucide-react";
import { Card } from "@/components/ui";
import { LANGS, type Lang } from "@/lib/i18n/dictionaries";
import type { SessionUser } from "@/lib/auth";

export function ProfileClient({ user }: { user: SessionUser }) {
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState<Lang>(user.language);
  const [anonymousHistory, setAnonymousHistory] = useState(true);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(0);

  const save = async () => {
    await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, language, privacy: { anonymous_history: anonymousHistory } }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const deleteAccount = async () => {
    if (confirmDelete === 0) {
      setConfirmDelete(1);
      setTimeout(() => setConfirmDelete(0), 4000);
      return;
    }
    await fetch("/api/auth/profile", { method: "DELETE" });
    window.location.href = "/";
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-900 text-teal-300">
          <UserRound size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{user.name}</h1>
          <p className="text-sm text-slate-500">
            {user.email} · {user.role === "admin" ? "Administrator" : "Member"}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-5">
        <Card>
          <h2 className="text-sm font-bold text-navy-900">Account details</h2>
          <div className="mt-3 space-y-3.5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-navy-900">Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-navy-900">
                <Languages size={12} /> Preferred language
              </label>
              <select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-teal-500">
                {LANGS.map((l) => (
                  <option key={l.code} value={l.code}>{l.native}</option>
                ))}
              </select>
            </div>
            <button onClick={save} className="inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700">
              {saved ? <Check size={14} /> : <Save size={14} />} {saved ? "Saved" : "Save changes"}
            </button>
          </div>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900" id="privacy">
            <ShieldCheck size={15} className="text-teal-600" /> Privacy settings
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            MedSafe collects minimum personal data: your name, email and preferences. Scan images are never stored.
          </p>
          <div className="mt-3 space-y-3">
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm">
              <span>
                <span className="font-medium text-navy-900">Keep scan history anonymous</span>
                <span className="block text-xs text-slate-500">New scans are not linked to your account.</span>
              </span>
              <input type="checkbox" checked={anonymousHistory} onChange={(e) => setAnonymousHistory(e.target.checked)} className="h-4 w-4 accent-teal-600" />
            </label>
            <p className="text-xs text-slate-400">
              Note: this prototype always stores scans anonymously server-side; the toggle demonstrates the privacy
              control UI for the production build.
            </p>
          </div>
        </Card>

        <Card className="border-red-100">
          <h2 className="flex items-center gap-2 text-sm font-bold text-red-700">
            <Trash2 size={15} /> Delete my account & data
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Removes your account, cabinet, reminders and history permanently (right to deletion).
          </p>
          <button
            onClick={deleteAccount}
            className={`mt-3 rounded-xl px-4 py-2 text-sm font-semibold ${
              confirmDelete === 1 ? "bg-red-600 text-white" : "border border-red-200 text-red-600 hover:bg-red-50"
            }`}
          >
            {confirmDelete === 1 ? "Click again to permanently delete" : "Delete account…"}
          </button>
        </Card>
      </div>
    </div>
  );
}
