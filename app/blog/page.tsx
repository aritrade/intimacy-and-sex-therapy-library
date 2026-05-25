/**
 * Blog index — index of every auto-generated SEO post.
 *
 * Single page, listing both:
 *   - Glossary "term explainer" posts (one per glossary entry).
 *   - Topic "curated reading" posts (one per topic tag with ≥3 resources).
 *
 * Designed to be the entry point for organic search traffic. Sitemap
 * picks up the same routes from generateStaticParams() in [slug]/page.tsx.
 */

import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resourceTags, tags } from "@/lib/db/schema";
import glossary from "@/content/glossary.json";

type GlossaryEntry = {
  term: string;
  category: string;
  plain: string;
};

export const metadata = {
  title: "Blog · Intimacy & Sex Therapy Library",
  description:
    "Plain-language explainers and curated reading lists on sex therapy, intimacy, and sexual health — drawn from clinician-vetted sources.",
};

export const dynamic = "force-static";
export const revalidate = 3600;

export default async function BlogIndex() {
  const entries = (glossary.entries as GlossaryEntry[]) ?? [];
  const sortedGloss = entries.slice().sort((a, b) => a.term.localeCompare(b.term));

  let topicCounts: Array<{ name: string; count: number }> = [];
  if (process.env.DATABASE_URL) {
    topicCounts = await db
      .select({
        name: tags.name,
        count: sql<number>`count(${resourceTags.resourceId})::int`,
      })
      .from(tags)
      .leftJoin(resourceTags, eq(resourceTags.tagId, tags.id))
      .where(eq(tags.category, "topic"))
      .groupBy(tags.name)
      .having(sql`count(${resourceTags.resourceId}) >= 3`);
  }
  topicCounts.sort((a, b) => b.count - a.count);

  return (
    <div className="container-page py-10 max-w-4xl">
      <header className="mb-8">
        <p className="pill-teal w-fit">Blog</p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
          Plain-language explainers
        </h1>
        <p className="mt-2 text-ink-600 max-w-prose">
          One page per concept and one page per topic, composed from clinician-reviewed
          sources only. Nothing on these pages is AI-generated text.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="font-serif text-xl text-ink-900 mb-3">Curated reading lists</h2>
        {topicCounts.length === 0 ? (
          <p className="text-sm text-ink-500">No topics with enough resources yet.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {topicCounts.map((t) => (
              <li key={t.name}>
                <Link
                  href={`/blog/topic-${t.name}`}
                  className="card card-hover p-3 block text-sm"
                >
                  <strong className="text-ink-900">{humanReadable(t.name)}</strong>
                  <span className="ml-2 text-xs text-ink-500">{t.count} resources</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-serif text-xl text-ink-900 mb-3">Term explainers</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {sortedGloss.map((e) => (
            <li key={e.term}>
              <Link
                href={`/blog/${termToSlug(e.term)}`}
                className="card card-hover p-3 block text-sm"
              >
                <strong className="text-ink-900">{e.term}</strong>
                <span className="ml-2 text-xs text-ink-500">{e.category.replaceAll("_", " ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function termToSlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function humanReadable(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
