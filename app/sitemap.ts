import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

const STATIC_PATHS: Array<{ path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/library", changeFrequency: "weekly", priority: 0.8 },
  { path: "/glossary", changeFrequency: "weekly", priority: 0.6 },
  { path: "/myths", changeFrequency: "weekly", priority: 0.6 },
  { path: "/paths", changeFrequency: "weekly", priority: 0.7 },
  { path: "/clinicians", changeFrequency: "weekly", priority: 0.7 },
  { path: "/assessments", changeFrequency: "monthly", priority: 0.5 },
  { path: "/decide", changeFrequency: "monthly", priority: 0.5 },
  { path: "/worksheets", changeFrequency: "monthly", priority: 0.5 },
  { path: "/about/privacy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/about/model", changeFrequency: "monthly", priority: 0.4 },
  { path: "/about/clinical-board", changeFrequency: "monthly", priority: 0.4 },
  { path: "/status", changeFrequency: "always", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
