import type { MetadataRoute } from "next";

const SITE_URL = "https://k12-demographic-data.vercel.app";

// Allow all standard crawlers everywhere. We don't disallow `?ids=…`
// query-param URLs even though each one renders a unique selection —
// `<link rel="canonical" href="/">` (set in layout.tsx) collapses them
// into one indexable resource for search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
