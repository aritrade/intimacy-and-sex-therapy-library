import type { MetadataRoute } from "next";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, resourceTags, tags } from "@/lib/db/schema";
import { COLLECTIONS } from "@/lib/library/collections";
import glossary from "@/content/glossary.json";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

const STATIC_PATHS: Array<{ path: string; changeFrequency: Entry["changeFrequency"]; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/catalog", changeFrequency: "daily", priority: 0.9 },
  { path: "/library", changeFrequency: "weekly", priority: 0.8 },
  { path: "/blog", changeFrequency: "weekly", priority: 0.7 },
  { path: "/glossary", changeFrequency: "weekly", priority: 0.6 },
  { path: "/myths", changeFrequency: "weekly", priority: 0.6 },
  { path: "/paths", changeFrequency: "weekly", priority: 0.7 },
  { path: "/clinicians", changeFrequency: "weekly", priority: 0.7 },
  { path: "/communities", changeFrequency: "weekly", priority: 0.6 },
  { path: "/assessments", changeFrequency: "monthly", priority: 0.5 },
  { path: "/decide", changeFrequency: "monthly", priority: 0.5 },
  { path: "/worksheets", changeFrequency: "monthly", priority: 0.5 },
  { path: "/about/privacy", changeFrequency: "monthly", priority: 0.4 },
  { path: "/about/model", changeFrequency: "monthly", priority: 0.4 },
  { path: "/about/clinical-board", changeFrequency: "monthly", priority: 0.4 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/status", changeFrequency: "always", priority: 0.3 },
];

function termToSlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const url = (path: string): string => `${SITE}${path}`;

  const entries: Entry[] = STATIC_PATHS.map(({ path, changeFrequency, priority }) => ({
    url: url(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));

  // Curated collections are static config, always safe to emit.
  for (const c of COLLECTIONS) {
    entries.push({
      url: url(`/library/collections/${c.slug}`),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  // One blog explainer per glossary term.
  for (const e of (glossary.entries as Array<{ term: string }>) ?? []) {
    entries.push({
      url: url(`/blog/${termToSlug(e.term)}`),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  if (!process.env.DATABASE_URL) return entries;

  try {
    // Published resources → canonical detail page + inline reader (when there
    // is real readable content: a stored PDF or extractable full text).
    const pubs = await db
      .select({
        slug: resources.slug,
        id: resources.id,
        updatedAt: resources.updatedAt,
        fullTextAvailable: resources.fullTextAvailable,
        pdfBlobUrl: resources.pdfBlobUrl,
      })
      .from(resources)
      .where(eq(resources.isPublished, true));

    for (const r of pubs) {
      entries.push({
        url: url(`/resource/${r.slug}`),
        lastModified: r.updatedAt ?? now,
        changeFrequency: "monthly",
        priority: 0.6,
      });
      if (r.fullTextAvailable || r.pdfBlobUrl) {
        entries.push({
          url: url(`/library/${r.id}`),
          lastModified: r.updatedAt ?? now,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }

    // Topic reading-list blog pages (same threshold the blog index uses).
    const topics = await db
      .select({ name: tags.name })
      .from(tags)
      .leftJoin(resourceTags, eq(resourceTags.tagId, tags.id))
      .where(eq(tags.category, "topic"))
      .groupBy(tags.name)
      .having(sql`count(${resourceTags.resourceId}) >= 3`);

    for (const t of topics) {
      entries.push({
        url: url(`/blog/topic-${t.name}`),
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    }
  } catch {
    // Never let a transient DB error blank the whole sitemap — static + config
    // entries above are still returned.
  }

  return entries;
}
