/**
 * In-memory fixed-window rate limiter for MedSafe API routes.
 *
 * Designed for the single-node SQLite deployment profile: state lives in the
 * Node process. For multi-instance production deployments, swap the store for
 * Redis (same interface). Returns a 429 response factory with Retry-After.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000; // memory guard

function reap(now: number) {
  if (buckets.size < MAX_KEYS) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAfterSeconds: number;
};

export function rateLimit(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  reap(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, resetAfterSeconds: windowSeconds };
  }
  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);
  return {
    ok: bucket.count <= limit,
    remaining,
    resetAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/** Best-effort client identity for rate limiting (proxy-aware, never trusted for auth). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function tooManyRequests(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down and try again shortly." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.resetAfterSeconds),
      },
    },
  );
}
