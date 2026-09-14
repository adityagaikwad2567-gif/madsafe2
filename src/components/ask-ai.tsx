"use client";

import { useState } from "react";
import { Brain, Send, BadgeCheck, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

type Answer = {
  answer: string;
  confidence: "high" | "medium" | "low" | "refused";
  sources: Array<{ title: string; publisher: string; updated: string }>;
  lastUpdated: string | null;
};

const SUGGESTED = [
  "What is this medicine used for?",
  "What are its important precautions?",
  "Why does it cause drowsiness?",
  "Does this medicine require professional supervision?",
  "Explain this medicine in simple language.",
];

const CONFIDENCE_STYLES: Record<Answer["confidence"], { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  medium: { label: "Medium", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  low: { label: "Low", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  refused: { label: "Refused — insufficient verified data", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};

export function AskMedSafeAI({ slug, medicineName }: { slug?: string; medicineName?: string }) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ q: string; a: Answer }>>([]);

  const ask = async (q: string) => {
    const text = slug && !q.toLowerCase().includes(medicineName?.toLowerCase() ?? "") ? `${medicineName}: ${q}` : q;
    if (!q.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const data: Answer = await res.json();
      setHistory((h) => [...h, { q, a: data }]);
    } finally {
      setBusy(false);
      setQuestion("");
    }
  };

  return (
    <Card>
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Brain size={18} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-navy-900">{t("ai.title")}</h2>
          <p className="text-xs text-slate-500">{t("ai.sub")}</p>
        </div>
      </div>

      {history.length > 0 ? (
        <div className="mt-4 space-y-3">
          {history.map((h, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-semibold text-slate-500">Q: {h.q}</p>
              <p className={`mt-2 whitespace-pre-line text-sm leading-relaxed ${h.a.confidence === "refused" ? "text-slate-500" : "text-navy-900"}`}>
                {h.a.answer}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-200 pt-2.5 text-xs">
                <span className="text-slate-500">
                  {t("ai.source")}: <strong className="font-medium text-navy-900">{h.a.sources[0]?.title ?? "—"}</strong>
                  {h.a.sources[0]?.publisher ? ` · ${h.a.sources[0].publisher}` : ""}
                </span>
                <span className="text-slate-500">
                  {t("ai.updated")}: <strong className="font-medium text-navy-900">{h.a.lastUpdated?.slice(0, 10) ?? "—"}</strong>
                </span>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-semibold ${CONFIDENCE_STYLES[h.a.confidence].cls}`}>
                  {h.a.confidence === "refused" ? <AlertCircle size={11} /> : <BadgeCheck size={11} />}
                  {t("ai.confidence")}: {CONFIDENCE_STYLES[h.a.confidence].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {SUGGESTED.map((s) => (
          <button
            key={s}
            onClick={() => ask(s)}
            disabled={busy}
            className="rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600 transition hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={t("ai.placeholder")}
          className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 3}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <Send size={14} /> Ask
        </button>
      </form>
      <p className="mt-2 text-xs text-slate-400">
        MedSafe AI answers only from verified records and clearly refuses when information is missing. It never diagnoses
        or prescribes.
      </p>
    </Card>
  );
}
