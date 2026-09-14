import { Suspense } from "react";
import { ScannerClient } from "@/components/scanner-client";

export const metadata = { title: "Scan Medicine" };

export default function ScanPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading scanner…</div>}>
        <ScannerClient />
      </Suspense>
    </div>
  );
}
