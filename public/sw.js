/**
 * MedSafe service worker — low-internet mode.
 *
 * Strategy:
 *  - Medicine profiles (/medicines/<slug>) → network-first with cache fallback,
 *    plus a warm-up request for the offline shell after each successful visit.
 *    Profiles are cached BOTH as the HTML document and as the Next.js RSC
 *    payload (?_rsc=), so client-side navigations also work offline.
 *  - Offline shell (/offline) → precached at install; shown for uncached
 *    profile requests while offline.
 *  - Static assets (/icons/*, manifest) → cache-first.
 *  - /api/* → never cached (safety content must always be fresh or absent).
 *
 * The cache is LRU-capped (MAX_PROFILES) and profile pages are stamped with a
 * `x-medsafe-cached-at` header so the offline page can show "saved X ago".
 */

const VERSION = "medsafe-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PROFILE_CACHE = `${VERSION}-profiles`;
const SHELL_CACHE = `${VERSION}-shell`;

const OFFLINE_URL = "/offline";
const MAX_PROFILES = 24;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

/** Evict oldest entries (by x-medsafe-cached-at stamp) beyond the LRU cap. */
async function trimProfiles() {
  const cache = await caches.open(PROFILE_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_PROFILES) return;
  const stamped = await Promise.all(
    keys.map(async (req) => {
      const res = await cache.match(req);
      const at = Number(res?.headers.get("x-medsafe-cached-at") ?? 0);
      return { req, at };
    })
  );
  stamped.sort((a, b) => a.at - b.at);
  for (const { req } of stamped.slice(0, stamped.length - MAX_PROFILES)) {
    await cache.delete(req);
  }
}

function isProfileUrl(url) {
  return (
    url.origin === self.location.origin &&
    url.pathname.startsWith("/medicines/") &&
    url.pathname !== "/medicines"
  );
}

async function stamp(response) {
  const headers = new Headers(response.headers);
  headers.set("x-medsafe-cached-at", String(Date.now()));
  const body = await response.arrayBuffer();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** Network-first for profile pages (HTML + RSC payloads), cache fallback offline. */
async function handleProfile(request) {
  const cache = await caches.open(PROFILE_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      await cache.put(request, await stamp(fresh.clone()));
      trimProfiles(); // async best-effort; don't await
    }
    return fresh;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (cached) return cached;
    // HTML navigation to an uncached profile → offline shell
    if (request.mode === "navigate") {
      const shell = await caches.open(SHELL_CACHE);
      const offline = await shell.match(OFFLINE_URL);
      if (offline) return offline;
    }
    return new Response("Offline and page not cached.", { status: 503 });
  }
}

/** Cache-first for static assets. */
async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Safety data is never served from cache — it must be fresh or explicitly offline.
  if (url.pathname.startsWith("/api/")) return;

  if (isProfileUrl(url)) {
    event.respondWith(handleProfile(request));
    return;
  }

  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icons/") ||
      url.pathname.startsWith("/_next/static/") ||
      url.pathname === "/manifest.webmanifest")
  ) {
    event.respondWith(handleStatic(request));
    return;
  }

  // Navigations while offline → precached shell for everything else too.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const shell = await caches.open(SHELL_CACHE);
        return (await shell.match(OFFLINE_URL)) ?? new Response("Offline.", { status: 503 });
      })
    );
  }
});

/** Message API used by the app: "cache-profile" warms a profile for offline use. */
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_PROFILE" && typeof event.data.url === "string") {
    event.waitUntil(
      (async () => {
        try {
          const cache = await caches.open(PROFILE_CACHE);
          const res = await fetch(event.data.url, { credentials: "same-origin" });
          if (res.ok) {
            await cache.put(event.data.url, await stamp(res.clone()));
            await trimProfiles();
          }
        } catch {
          /* offline — nothing to warm */
        }
      })()
    );
  }
});
