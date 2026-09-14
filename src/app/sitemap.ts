import type { MetadataRoute } from "next";
import { getDb } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.replace(/\/$/, "");
  const staticRoutes = ["", "/medicines", "/scan", "/ai", "/cyclesafe", "/about", "/reports/new"].map((p) => ({
    url: `${base}${p || "/"}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.7,
  }));

  let medicineRoutes: MetadataRoute.Sitemap = [];
  try {
    const slugs = getDb().prepare("SELECT slug, last_updated FROM medicines ORDER BY name").all() as Array<{
      slug: string;
      last_updated: string;
    }>;
    medicineRoutes = slugs.map((m) => ({
      url: `${base}/medicines/${m.slug}`,
      lastModified: m.last_updated ? new Date(m.last_updated) : new Date(),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }));
  } catch {
    // DB unavailable at build edge — static routes are still emitted.
  }

  return [...staticRoutes, ...medicineRoutes];
}
