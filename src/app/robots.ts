import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// Env-dependent output — evaluate per request, never bake at build time.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/offline"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
