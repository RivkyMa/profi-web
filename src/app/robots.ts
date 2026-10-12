import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    // The dashboard is a mock demo; only the landing page should be indexed.
    rules: [{ userAgent: "*", allow: "/", disallow: "/app/" }],
    sitemap: `${site}/sitemap.xml`,
  };
}
