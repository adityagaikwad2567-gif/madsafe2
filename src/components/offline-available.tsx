"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, Check, Info } from "lucide-react";
import { cacheProfileOffline } from "@/components/pwa-register";

/**
 * Subtle "saved for offline" affordance on medicine profiles.
 * Shows connection state and, once primed, confirms the profile is available offline.
 */
export function OfflineAvailable({ slug }: { slug: string }) {
  const [state, setState] = useState<"checking" | "primed" | "offline" | "unsupported">("checking");

  useEffect(() => {
    // Priming the service-worker cache after mount (fetch happens inside SW warm-up).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(
      "serviceWorker" in navigator
        ? navigator.onLine
          ? "primed"
          : "offline"
        : "unsupported"
    );
    if ("serviceWorker" in navigator && navigator.onLine) {
      cacheProfileOffline(slug);
    }
  }, [slug]);

  if (state === "unsupported") return null;

  return (
    <span
      id="medsafe-offline-status"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        state === "offline"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-teal-200 bg-teal-50 text-teal-700"
      }`}
      title={
        state === "offline"
          ? "Offline — an offline copy of this page was opened from your device."
          : "This profile is saved on your device for offline access (low-internet mode)."
      }
    >
      {state === "offline" ? <WifiOff size={11} /> : state === "primed" ? <Check size={11} /> : <Info size={11} />}
      {state === "offline"
        ? "Offline copy shown"
        : state === "primed"
          ? "Saved for offline"
          : "Checking…"}
    </span>
  );
}
