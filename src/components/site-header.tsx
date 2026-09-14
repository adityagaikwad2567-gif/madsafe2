"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ScanLine, Menu, X, ShieldCheck, LogOut, UserRound, LayoutDashboard } from "lucide-react";
import { useI18n, LanguageSwitcher } from "@/lib/i18n/provider";
import type { SessionUser } from "@/lib/auth";

const NAV: Array<{ href: string; key: string }> = [
  { href: "/", key: "nav.home" },
  { href: "/scan", key: "nav.scan" },
  { href: "/medicines", key: "nav.medicines" },
  { href: "/cyclesafe", key: "nav.cyclesafe" },
  { href: "/cabinet", key: "nav.cabinet" },
  { href: "/reports", key: "nav.reports" },
  { href: "/about", key: "nav.about" },
];

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setUser(d.user ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-teal-300">
            <ScanLine size={20} />
          </span>
          <span className="text-lg font-bold tracking-tight text-navy-900">
            Med<span className="text-teal-600">Safe</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-navy-50 text-navy-900" : "text-slate-600 hover:bg-slate-50 hover:text-navy-900"
                }`}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher compact />
          {user ? (
            <div className="flex items-center gap-2">
              {user.role === "admin" ? (
                <Link
                  href="/admin"
                  className="flex items-center gap-1.5 rounded-lg border border-navy-200 px-3 py-1.5 text-sm font-medium text-navy-800 hover:bg-navy-50"
                >
                  <LayoutDashboard size={15} /> {t("nav.admin")}
                </Link>
              ) : null}
              <Link
                href="/profile"
                className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
              >
                <UserRound size={15} /> {user.name.split(" ")[0]}
              </Link>
              <button
                onClick={logout}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-900"
                aria-label={t("nav.logout")}
                title={t("nav.logout")}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <ShieldCheck size={15} /> {t("nav.login")}
            </Link>
          )}
        </div>

        <button
          className="rounded-lg p-2 text-navy-900 lg:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === item.href ? "bg-navy-50 text-navy-900" : "text-slate-700"
                }`}
              >
                {t(item.key)}
              </Link>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
            <LanguageSwitcher compact />
            {user ? (
              <div className="flex items-center gap-2">
                {user.role === "admin" ? (
                  <Link href="/admin" onClick={() => setOpen(false)} className="text-sm font-medium text-navy-800">
                    {t("nav.admin")}
                  </Link>
                ) : null}
                <Link href="/profile" onClick={() => setOpen(false)} className="text-sm font-medium text-teal-700">
                  {t("nav.profile")}
                </Link>
                <button onClick={logout} className="text-sm text-slate-500">
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <Link href="/login" onClick={() => setOpen(false)} className="text-sm font-medium text-teal-700">
                {t("nav.login")}
              </Link>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}
