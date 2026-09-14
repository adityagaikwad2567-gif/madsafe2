"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WifiOff, Package, Clock, Trash2, RefreshCw, ScanLine } from "lucide-react";
import { Card, Badge } from "@/components/ui";
import { useI18n } from "@/lib/i18n/provider";

/**
 * Offline / low-internet landing page.
 * Lists medicine profiles saved in the service-worker cache so a user on a
 * patchy connection can still review safety information they looked at before.
 */

type Saved = { url: string; slug: string; name: string; cachedAt: number };

const SLUG_LABEL: Record<string, string> = {};

function labelFor(slug: string): string {
  return (
    SLUG_LABEL[slug] ??
    slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function savedAgo(ts: number): string {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export default function OfflinePage() {
  const { t } = useI18n();
  const [saved, setSaved] = useState<Saved[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!("caches" in window)) {
        setReady(true);
        return;
      }
      try {
        const keys = await caches.keys();
        const profileCacheName = keys.find((k) => k.includes("-profiles"));
        if (!profileCacheName) {
          setReady(true);
          return;
        }
        const cache = await caches.open(profileCacheName);
        const reqs = await cache.keys();
        const seen = new Set<string>();
        const items: Saved[] = [];
        for (const req of reqs) {
          const u = new URL(req.url);
          const slug = u.pathname.split("/")[2];
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);
          const res = await cache.match(req);
          const cachedAt = Number(res?.headers.get("x-medsafe-cached-at") ?? 0);
          items.push({ url: u.pathname, slug, name: labelFor(slug), cachedAt });
        }
        items.sort((a, b) => b.cachedAt - a.cachedAt);
        if (alive) setSaved(items);
      } catch {
        /* cache API unavailable */
      }
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const clearSaved = async () => {
    if (!("caches" in window)) return;
    const keys = await caches.keys();
    const name = keys.find((k) => k.includes("-profiles"));
    if (name) await caches.delete(name);
    setSaved([]);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
          <WifiOff size={26} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy-900">{t("offline.title")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("offline.sub")}</p>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-900">
          <Package size={15} className="text-teal-600" /> {t("offline.saved")} ({saved.length})
        </h2>
        {saved.length > 0 ? (
          <button
            onClick={clearSaved}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={13} /> {t("offline.clear")}
          </button>
        ) : null}
      </div>

      {!ready ? (
        <Card className="mt-3 text-sm text-slate-500">Checking saved copies…</Card>
      ) : saved.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm text-slate-600">
            {t("offline.none")}{" "}
            <Link href="/medicines" className="font-medium text-teal-700 hover:underline" />
            .
          </p>
        </Card>
      ) : (
        <ul className="mt-3 space-y-2">
          {saved.map((s) => (
            <li key={s.url}>
              <Card className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link
                    href={s.url}
                    className="truncate text-sm font-bold text-navy-900 hover:text-teal-700"
                  >
                    {s.name}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={11} /> Saved {s.cachedAt ? savedAgo(s.cachedAt) : "recently"} ·
                    offline copy
                  </p>
                </div>
                <Badge tone="teal">
                  <span className="inline-flex items-center gap-1">
                    <ScanLine size={11} /> {t("offline.available")}
                  </span>
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-6 border-dashed">
        <p className="text-xs leading-relaxed text-slate-500">
          <strong className="text-navy-900">How this works:</strong> MedSafe keeps up to 24 recently
          viewed profiles on your device. Saved copies include the full safety indicator and warning
          cards. Live checks — AI answers, cabinet sync and safety updates — need a connection and
          are never served from cache. Expired-medicine warnings always re-check the date at render
          time; an offline copy shows the date as saved, so confirm with a pharmacist when in doubt.
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
          <RefreshCw size={11} /> Pages refresh automatically whenever you open them with a signal.
        </p>
      </Card>
    </div>
  );
}
