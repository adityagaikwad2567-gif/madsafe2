"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

type Suggestion = { slug: string; name: string; brand_name: string | null; verification: string };

export function MedicineSearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounced live suggestions — always from the connected database, never hard-coded.
  useEffect(() => {
    const term = q.trim();
    const t = setTimeout(() => {
      if (term.length < 2) {
        setSuggestions([]);
        return;
      }
      fetch(`/api/medicines?suggest=1&q=${encodeURIComponent(term)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.suggestions) {
            setSuggestions(data.suggestions);
            setOpen(true);
          }
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  // Close the dropdown on outside clicks.
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          router.push(`/medicines${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            placeholder="Search by name, brand, generic or category…"
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            aria-label="Search medicines"
          />
        </div>
        <button type="submit" className="rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
          Search
        </button>
      </form>

      {open && suggestions.length > 0 ? (
        <ul className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {suggestions.map((s) => (
            <li key={s.slug}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push(`/medicines/${s.slug}`);
                }}
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-teal-50"
              >
                <span className="font-medium text-navy-900">{s.name}</span>
                <span className="text-xs text-slate-400">
                  {s.verification === "verified" ? "Verified" : "Unverified"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
