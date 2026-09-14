"use client";

import Link from "next/link";
import { Camera, Upload, Search, ScanLine, ShieldCheck, Languages, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function HomeHero() {
  const { t } = useI18n();
  return (
    <section className="panel-gradient text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-20">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-white/15">
            <ScanLine size={13} /> {t("home.hero.tagline")}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Med<span className="text-teal-300">Safe</span>
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-navy-100 sm:text-base">
            {t("home.hero.subtitle")}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/scan?mode=camera"
              className="inline-flex items-center gap-2 rounded-xl bg-teal-500 px-5 py-3 text-sm font-semibold text-navy-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-400"
            >
              <Camera size={17} /> {t("home.hero.scan")}
            </Link>
            <Link
              href="/scan?mode=upload"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              <Upload size={17} /> {t("home.hero.upload")}
            </Link>
            <Link
              href="/scan?mode=manual"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white ring-1 ring-white/20 transition hover:bg-white/15"
            >
              <Search size={17} /> {t("home.hero.search")}
            </Link>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-navy-200">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-teal-300" /> Rule-based safety checks</span>
            <span className="inline-flex items-center gap-1.5"><Languages size={14} className="text-teal-300" /> English · हिंदी · मराठी</span>
            <span className="inline-flex items-center gap-1.5"><Lock size={14} className="text-teal-300" /> Privacy-friendly scans</span>
          </div>
        </div>

        {/* Smartphone-style scanner visual */}
        <div className="mx-auto w-full max-w-[280px]">
          <div className="relative overflow-hidden rounded-[2.2rem] border border-white/20 bg-navy-950 shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3 text-[10px] text-navy-200">
              <span>MedSafe Scanner</span>
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400/50" />
              </span>
            </div>
            <div className="relative mx-4 mb-6 aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-b from-navy-800 to-navy-900">
              <div className="absolute inset-x-8 top-10 rounded-lg border border-white/15 bg-white/5 p-3">
                <div className="h-2 w-24 rounded bg-white/25" />
                <div className="mt-2 h-2 w-16 rounded bg-white/15" />
                <div className="mt-3 flex items-end gap-1" aria-hidden>
                  {[3, 1, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1].map((w, i) => (
                    <span key={i} className="inline-block bg-white/70" style={{ width: w, height: 18 }} />
                  ))}
                </div>
              </div>
              <div className="animate-scanline absolute inset-x-4 h-0.5 rounded bg-teal-300 shadow-[0_0_16px_2px_rgba(94,234,212,0.7)]" />
              <div className="absolute inset-4 rounded-xl border-2 border-teal-400/40" />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-navy-200">Demo pack: Dolo 650 — verified record</p>
        </div>
      </div>
    </section>
  );
}
