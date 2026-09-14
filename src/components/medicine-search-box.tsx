"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

export function MedicineSearchBox({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/medicines${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
      className="flex gap-2"
    >
      <div className="relative flex-1">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, brand, generic or category…"
          className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <button type="submit" className="rounded-xl bg-navy-900 px-4 text-sm font-semibold text-white hover:bg-navy-800">
        Search
      </button>
    </form>
  );
}
