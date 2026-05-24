import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/catalog",
          "/library",
          "/glossary",
          "/myths",
          "/paths",
          "/clinicians",
          "/assessments",
          "/decide",
          "/worksheets",
          "/about/",
          "/status",
        ],
        disallow: [
          // Anything user-specific or internal must not be crawled.
          "/companion",
          "/chat",
          "/account",
          "/sign-in",
          "/admin",
          "/api/",
        ],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
