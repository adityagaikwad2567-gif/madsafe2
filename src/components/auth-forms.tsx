"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ScanLine, LogIn, UserPlus, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";

export function AuthForms({
  demoAdmin,
}: {
  demoAdmin?: { email: string; password: string };
}) {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [tab, setTab] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(tab === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tab === "login" ? { email, password } : { name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      window.location.href = data.user?.role === "admin" ? "/admin" : next;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-teal-300">
          <ScanLine size={19} />
        </span>
        <div>
          <h1 className="text-lg font-bold text-navy-900">Welcome to MedSafe</h1>
          <p className="text-xs text-slate-500">Secure account · minimum personal data</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((tb) => (
          <button
            key={tb}
            type="button"
            onClick={() => { setTab(tb); setError(null); }}
            className={`rounded-lg py-2 transition ${tab === tb ? "bg-white text-navy-900 shadow-sm" : "text-slate-500"}`}
          >
            {tb === "login" ? "Login" : "Register"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3.5">
        {tab === "register" ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-navy-900">Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={80}
              className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-xs font-semibold text-navy-900">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-navy-900">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
          {tab === "register" ? (
            <p className="mt-1 text-xs text-slate-400">At least 8 characters, with a letter and a number.</p>
          ) : null}
        </div>

        {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
        >
          {tab === "login" ? <LogIn size={15} /> : <UserPlus size={15} />}
          {busy ? "Please wait…" : tab === "login" ? "Login" : "Create account"}
        </button>
      </form>

      <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500">
        <p className="flex items-center gap-1.5 font-semibold text-navy-900">
          <ShieldCheck size={13} className="text-teal-600" /> Demo accounts
        </p>
        <p className="mt-1">User — demo@medsafe.local · Demo@1234</p>
        {demoAdmin ? (
          <p>
            Admin — {demoAdmin.email} · {demoAdmin.password}
          </p>
        ) : null}
      </div>

      <p className="mt-4 text-center text-xs text-slate-400">
        By continuing you accept that MedSafe is an awareness tool, not medical advice.{" "}
        <Link href="/about#disclaimer" className="underline hover:text-slate-600">Learn more</Link>
      </p>
    </Card>
  );
}
