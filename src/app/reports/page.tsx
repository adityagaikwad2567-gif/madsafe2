import { Suspense } from "react";
import { ReportsClient } from "@/components/reports-client";

export const metadata = { title: "Safety Reports" };

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading…</div>}>
        <ReportsClient />
      </Suspense>
    </div>
  );
}
