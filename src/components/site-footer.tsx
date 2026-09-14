"use client";

import Link from "next/link";
import { ScanLine, ShieldAlert, FlaskConical } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-teal-300">
                <ScanLine size={20} />
              </span>
              <span className="text-lg font-bold text-navy-900">
                Med<span className="text-teal-600">Safe</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {t("footer.tagline")}
            </p>
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
              <FlaskConical size={13} /> {t("footer.demo")}
            </p>
          </div>

          <div className="text-sm">
            <h3 className="mb-3 font-semibold text-navy-900">{t("footer.platform")}</h3>
            <ul className="space-y-2 text-slate-600">
              <li><Link href="/scan" className="hover:text-teal-700">{t("nav.scan")}</Link></li>
              <li><Link href="/medicines" className="hover:text-teal-700">{t("nav.medicines")}</Link></li>
              <li><Link href="/cabinet" className="hover:text-teal-700">{t("nav.cabinet")}</Link></li>
              <li><Link href="/cyclesafe" className="hover:text-teal-700">{t("nav.cyclesafe")}</Link></li>
              <li><Link href="/reports" className="hover:text-teal-700">{t("nav.reports")}</Link></li>
              <li><Link href="/about" className="hover:text-teal-700">{t("nav.about")}</Link></li>
            </ul>
          </div>

          <div className="text-sm">
            <h3 className="mb-3 font-semibold text-navy-900">{t("footer.trust")}</h3>
            <ul className="space-y-2 text-slate-600">
              <li><Link href="/about#disclaimer" className="hover:text-teal-700">{t("home.disclaimer.title")}</Link></li>
              <li><Link href="/profile#privacy" className="hover:text-teal-700">{t("footer.privacy")}</Link></li>
              <li><Link href="/about#privacy" className="hover:text-teal-700">{t("footer.dataPrivacy")}</Link></li>
              <li><Link href="/admin" className="hover:text-teal-700">{t("nav.admin")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
            <ShieldAlert size={16} className="mt-0.5 shrink-0 text-navy-500" />
            <span>
              <strong className="text-navy-900">{t("home.disclaimer.title")}:</strong>{" "}
              {t("footer.disclaimer")}
            </span>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} MedSafe — {t("footer.rights")} · {t("home.hero.tagline")}
        </p>
      </div>
    </footer>
  );
}
