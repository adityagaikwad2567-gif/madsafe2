/** Canonical site URL — shared by metadata, robots and sitemap.
 * Precedence: NEXT_PUBLIC_SITE_URL → auto-assigned Vercel URL → localhost (dev only).
 * Set NEXT_PUBLIC_SITE_URL in the host dashboard so no localhost URL is ever emitted. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
