"use client";

import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/provider";

/**
 * PWA glue:
 *  - registers /sw.js (service worker)
 *  - shows the native install prompt (beforeinstallprompt) as a dismissible banner
 *  - shows a subtle offline indicator when the connection drops
 *
 * Renders nothing until one of those states applies.
 */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "medsafe_install_dismissed";
const SW_PATH = "/sw.js";

export function PwaRegister() {
  const { t } = useI18n();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // ── service worker registration ──
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(SW_PATH).catch(() => {
        /* SW unsupported/blocked — the site still works online */
      });
    }

    // ── offline indicator ──
    const syncOnline = () => setOffline(!navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);

    // ── install prompt ──
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
      setInstallEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
    };
  }, []);

  const doInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setInstallEvent(null);
  };

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setInstallEvent(null);
  };

  return (
    <>
      {offline ? (
        <div
          id="medsafe-offline-banner"
          className="fixed inset-x-0 top-0 z-[60] bg-amber-500 py-1.5 text-center text-xs font-semibold text-amber-950"
          role="status"
        >
          {t("pwa.offlineBanner")}
        </div>
      ) : null}

      {installEvent ? (
        <div
          id="medsafe-install-banner"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-teal-200 bg-white p-3 shadow-lg"
        >
          <div className="rounded-xl bg-teal-50 p-2 text-teal-700">
            <Download size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-navy-900">{t("pwa.install.title")}</p>
            <p className="text-xs text-slate-500">{t("pwa.install.body")}</p>
          </div>
          <button
            onClick={doInstall}
            className="shrink-0 rounded-xl bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
          >
            {t("pwa.install.action")}
          </button>
          <button
            onClick={dismiss}
            aria-label="Dismiss install prompt"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
    </>
  );
}

/**
 * Fire-and-forget helper: ask the service worker to keep a medicine profile
 * available offline. Safe to call anywhere; no-ops without SW support.
 */
export function cacheProfileOffline(slug: string): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.active?.postMessage({ type: "CACHE_PROFILE", url: `/medicines/${slug}` });
    })
    .catch(() => {
      /* SW not controlling yet — page visit itself primes the cache */
    });
}
