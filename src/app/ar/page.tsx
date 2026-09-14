import { Suspense } from "react";
import { ArExplainerClient } from "@/components/ar-explainer-client";

export const metadata = { title: "AR Medicine Explainer" };

export default function ArPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <Suspense fallback={<div className="py-20 text-center text-sm text-slate-500">Loading AR explainer…</div>}>
        <ArExplainerClient />
      </Suspense>
    </div>
  );
}
