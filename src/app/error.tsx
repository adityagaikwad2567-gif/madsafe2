"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui";

/**
 * Global error boundary — shown when a client-side render fails.
 * Offers a retry (reload) instead of a blank screen, and never leaks
 * error details to end users.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for diagnostics without exposing internals in the UI.
    console.error("MedSafe client error:", error.message);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-4 py-16">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 text-orange-600">
        <AlertTriangle size={26} />
      </span>
      <h1 className="mt-5 text-3xl font-bold text-navy-900">Something went wrong</h1>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-slate-500">
        An unexpected error occurred while loading this page. It has been logged — please try
        again. If it keeps happening, return home and continue from there.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <RefreshCw size={15} /> Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-slate-50"
        >
          <Home size={15} /> Go home
        </Link>
      </div>
      <Card className="mt-8 w-full">
        <p className="text-xs leading-relaxed text-slate-500">
          <strong className="text-navy-900">MedSafe is an awareness and information platform.</strong>{" "}
          It does not diagnose medical conditions, prescribe medicines, recommend dosages, or
          replace a doctor or pharmacist. Always consult a qualified healthcare professional before
          starting, stopping or changing any medicine.
        </p>
      </Card>
    </main>
  );
}
