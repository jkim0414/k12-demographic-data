import type { MetadataRoute } from "next";

const SITE_URL = "https://k12-demographic-data.vercel.app";

// Single-route app. The `?ids=…&mode=…` permutations are an infinite
// combinatorial space — those resolve to `/` via canonical, so the
// sitemap only needs the root.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
