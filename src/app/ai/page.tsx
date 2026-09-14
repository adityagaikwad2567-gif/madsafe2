import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AskMedSafeAI } from "@/components/ask-ai";
import { Card } from "@/components/ui";

export const metadata = { title: "MedSafe AI" };

const RAG_STEPS = [
  "User question",
  "Medicine identification",
  "Verified medicine database",
  "Relevant knowledge retrieval",
  "Safety rules (deterministic)",
  "AI explanation",
];

export default function AIPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="text-2xl font-bold text-navy-900">MedSafe AI</h1>
      <p className="mt-1 text-sm text-slate-600">
        Retrieval-augmented explanations grounded in the verified medicine database — with honest refusals.
      </p>

      <div className="mt-6">
        <Suspense fallback={<Card className="text-sm text-slate-500">Loading MedSafe AI…</Card>}>
          <AskMedSafeAI />
        </Suspense>
      </div>

      <Card className="mt-8">
        <h2 className="text-sm font-bold text-navy-900">How the RAG pipeline works</h2>
        <ol className="mt-3 space-y-2">
          {RAG_STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2.5 text-sm text-slate-700">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-700">{i + 1}</span>
              {s}
              {i < RAG_STEPS.length - 1 ? <ArrowRight size={13} className="text-slate-300" /> : null}
            </li>
          ))}
        </ol>
        <p className="mt-4 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
          Safety rules run deterministically from the database — the language layer only explains, simplifies and
          translates retrieved content. If retrieval confidence is low, MedSafe AI refuses to answer rather than invent
          medical information.
        </p>
      </Card>

      <p className="mt-4 text-sm text-slate-600">
        Want grounded answers about a specific medicine?{" "}
        <Link href="/medicines" className="font-semibold text-teal-700 hover:underline">
          Browse the database
        </Link>{" "}
        and use “Ask MedSafe AI” on any profile.
      </p>
    </div>
  );
}
