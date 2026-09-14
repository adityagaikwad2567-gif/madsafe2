import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  sub,
  center = false,
}: {
  title: string;
  sub?: string;
  center?: boolean;
}) {
  return (
    <div className={`mb-6 ${center ? "text-center" : ""}`}>
      <h2 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h2>
      {sub ? <p className="mt-1 text-sm text-slate-600">{sub}</p> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "teal" | "navy" | "amber" | "red" | "pink";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    navy: "bg-navy-50 text-navy-700 border-navy-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    pink: "bg-pink-50 text-pink-700 border-pink-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export const LEVEL_STYLES: Record<string, { dot: string; bg: string; border: string; text: string; emoji: string }> = {
  green: { dot: "bg-emerald-500", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", emoji: "🟢" },
  yellow: { dot: "bg-amber-400", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", emoji: "🟡" },
  orange: { dot: "bg-orange-500", bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", emoji: "🟠" },
  red: { dot: "bg-red-500", bg: "bg-red-50", border: "border-red-200", text: "text-red-800", emoji: "🔴" },
};

export function LevelPill({ level, label }: { level: string; label: string }) {
  const s = LEVEL_STYLES[level] ?? LEVEL_STYLES.green;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.bg} ${s.border} ${s.text}`}>
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}
