/**
 * Auto-generated SEO blog routes.
 *
 * One route per:
 *   - Glossary entry  → /blog/<term-slug>
 *   - Catalog topic   → /blog/topic-<topic-slug>  (top resources curated for SEO)
 *
 * Why we need /blog/* in addition to /catalog/* and /glossary:
 *   - Google indexes longer-form, single-topic pages better than
 *     filterable listing pages.
 *   - The blog routes can carry richer schema.org markup (Article,
 *     MedicalCondition) than the catalog pages.
 *   - Internal links from each blog post back to /catalog and /glossary
 *     drive crawl depth.
 *
 * Content is NEVER LLM-generated — every page is composed from human-
 * authored sources: the glossary JSON (curator-written) and the
 * catalog rows (curator-approved).
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources, resourceTags, tags } from "@/lib/db/schema";
import glossary from "@/content/glossary.json";
import { BRAND_COPY } from "@/lib/brand/tokens";

export const dynamic = "force-static";
export const revalidate = 3600;

type GlossaryEntry = {
  term: string;
  aka?: string[];
  category: string;
  plain: string;
  clinical?: string;
  see_also?: string[];
};

type Resolved =
  | { kind: "glossary"; entry: GlossaryEntry; relatedResources: ResourceCard[] }
  | { kind: "topic"; topicSlug: string; resources: ResourceCard[] }
  | null;

type ResourceCard = {
  id: string;
  title: string;
  externalUrl: string;
  summary: string | null;
  authors: string[];
  publishedYear: number | null;
};

const TOPIC_PREFIX = "topic-";

export async function generateStaticParams() {
  // Pre-render every glossary slug. Topic slugs we can ISR on demand
  // since the catalog can grow.
  const entries = (glossary.entries as GlossaryEntry[]) ?? [];
  return entries.map((e) => ({ slug: termToSlug(e.term) }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await resolveSlug(params.slug);
  if (!data) {
    return { title: "Not found · Blog" };
  }
  if (data.kind === "glossary") {
    const e = data.entry;
    return {
      title: `${e.term} — explained · ${BRAND_COPY.fullName}`,
      description: e.plain.slice(0, 160),
      openGraph: {
        title: `${e.term} — what it means and what helps`,
        description: e.plain.slice(0, 200),
        type: "article",
      },
      alternates: { canonical: `/blog/${params.slug}` },
    };
  }
  return {
    title: `${humanReadableTopic(data.topicSlug)} — curated reading · ${BRAND_COPY.fullName}`,
    description: `Curated, clinician-vetted resources on ${humanReadableTopic(data.topicSlug)}. Books, papers, and guidelines pulled from authoritative sources.`,
    openGraph: {
      title: `${humanReadableTopic(data.topicSlug)} — reading list`,
      type: "article",
    },
    alternates: { canonical: `/blog/${params.slug}` },
  };
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const data = await resolveSlug(params.slug);
  if (!data) notFound();

  if (data.kind === "glossary") return <GlossaryArticle slug={params.slug} {...data} />;
  return <TopicArticle slug={params.slug} {...data} />;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function GlossaryArticle({
  slug,
  entry,
  relatedResources,
}: Extract<Resolved, { kind: "glossary" }> & { slug: string }) {
  const ldjson = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${entry.term} — explained`,
    inLanguage: "en",
    isPartOf: { "@type": "WebSite", name: BRAND_COPY.fullName, url: BRAND_COPY.url },
    description: entry.plain.slice(0, 250),
    author: { "@type": "Organization", name: BRAND_COPY.fullName },
    publisher: { "@type": "Organization", name: BRAND_COPY.fullName },
    mainEntityOfPage: `${BRAND_COPY.url}/blog/${slug}`,
  };

  return (
    <article className="container-page py-10 max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldjson) }}
      />
      <p className="pill-teal w-fit">Glossary · {entry.category.replaceAll("_", " ")}</p>
      <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">{entry.term}</h1>
      {entry.aka && entry.aka.length > 0 && (
        <p className="mt-1 text-sm text-ink-500">Also called: {entry.aka.join(", ")}</p>
      )}

      <section className="prose prose-ink mt-6 max-w-none">
        <h2 className="font-serif text-xl text-ink-900">In plain language</h2>
        <p className="text-ink-700 leading-relaxed">{entry.plain}</p>

        {entry.clinical && (
          <>
            <h2 className="font-serif text-xl text-ink-900 mt-8">In clinical language</h2>
            <p className="text-ink-700 leading-relaxed">{entry.clinical}</p>
          </>
        )}

        {entry.see_also && entry.see_also.length > 0 && (
          <>
            <h2 className="font-serif text-xl text-ink-900 mt-8">See also</h2>
            <ul className="space-y-1">
              {entry.see_also.map((s) => (
                <li key={s}>
                  <Link href={`/glossary#${s.toLowerCase()}`} className="underline">
                    {s.replaceAll("_", " ")}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {relatedResources.length > 0 && (
          <>
            <h2 className="font-serif text-xl text-ink-900 mt-10">Curated reading</h2>
            <p className="text-ink-600">
              Hand-picked resources on {entry.term.toLowerCase()} from the catalog. All
              authored or reviewed by clinicians.
            </p>
            <ul className="not-prose mt-4 space-y-3">
              {relatedResources.map((r) => (
                <li key={r.id}>
                  <ResourceCardView r={r} />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <footer className="mt-10 text-xs text-ink-500">
        <p>
          This page is part of the {BRAND_COPY.fullName}. The text above is curator-
          authored, not AI-generated. If you spot something wrong, please tell us via the
          contact link in the footer.
        </p>
        <p className="mt-3">
          <Link href="/glossary" className="underline">
            ← Back to glossary
          </Link>
          {" · "}
          <Link href="/catalog" className="underline">
            Browse catalog
          </Link>
        </p>
      </footer>
    </article>
  );
}

function TopicArticle({
  slug,
  topicSlug,
  resources,
}: Extract<Resolved, { kind: "topic" }> & { slug: string }) {
  const human = humanReadableTopic(topicSlug);
  const ldjson = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${human} — curated reading`,
    itemListElement: resources.slice(0, 25).map((r, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: r.externalUrl,
      name: r.title,
    })),
  };

  return (
    <article className="container-page py-10 max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ldjson) }}
      />
      <p className="pill-teal w-fit">Reading list · {topicSlug}</p>
      <h1 className="mt-3 font-serif text-3xl sm:text-4xl text-ink-900">
        Curated reading on {human}
      </h1>
      <p className="mt-2 text-ink-600">
        Every link below is to a resource we&apos;ve vetted against our{" "}
        <Link href="/about" className="underline">
          editorial bar
        </Link>
        : authored by credentialed clinicians or peer-reviewed researchers, from a
        recognised source. The list is updated as new evidence-grounded items are added
        to the catalog.
      </p>

      {resources.length === 0 ? (
        <p className="mt-6 text-ink-500">
          No published resources on this topic yet — try the{" "}
          <Link href="/catalog" className="underline">
            full catalog
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {resources.map((r) => (
            <li key={r.id}>
              <ResourceCardView r={r} />
            </li>
          ))}
        </ul>
      )}

      <footer className="mt-10 text-xs text-ink-500">
        <p>
          <Link href="/catalog" className="underline">
            ← Back to catalog
          </Link>
        </p>
      </footer>
    </article>
  );
}

function ResourceCardView({ r }: { r: ResourceCard }) {
  return (
    <a
      href={r.externalUrl}
      target="_blank"
      rel="noreferrer"
      className="card card-hover p-4 block"
    >
      <h3 className="font-serif text-base text-ink-900">{r.title}</h3>
      <p className="mt-1 text-xs text-ink-500">
        {r.authors.length > 0 ? r.authors.slice(0, 3).join(", ") : "—"}
        {r.publishedYear ? ` · ${r.publishedYear}` : ""}
      </p>
      {r.summary && <p className="mt-2 text-sm text-ink-700 line-clamp-3">{r.summary}</p>}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

async function resolveSlug(slug: string): Promise<Resolved> {
  // Topic route: /blog/topic-<topic-slug>
  if (slug.startsWith(TOPIC_PREFIX)) {
    const topicSlug = slug.slice(TOPIC_PREFIX.length);
    const list = await fetchResourcesForTopic(topicSlug);
    if (list.length === 0) return null;
    return { kind: "topic", topicSlug, resources: list };
  }

  // Glossary route: any slug matching a glossary term.
  const entries = (glossary.entries as GlossaryEntry[]) ?? [];
  const entry = entries.find((e) => termToSlug(e.term) === slug);
  if (!entry) return null;
  const relatedResources = await fetchResourcesForTerm(entry.term);
  return { kind: "glossary", entry, relatedResources };
}

async function fetchResourcesForTerm(term: string): Promise<ResourceCard[]> {
  if (!process.env.DATABASE_URL) return [];
  // The "Curated reading" list is a non-essential SEO enrichment; the page's
  // primary content is the curator-authored glossary JSON. Never let a
  // transient DB issue (e.g. connection saturation) fail a static build or an
  // ISR revalidate — degrade to no related reading instead.
  try {
    // Title or summary contains the term — keep it cheap; we only need
    // a small list for SEO.
    const rows = await db
      .select({
        id: resources.id,
        title: resources.title,
        externalUrl: resources.externalUrl,
        summary: resources.summary,
        authors: resources.authors,
        publishedAt: resources.publishedAt,
      })
      .from(resources)
      .where(
        and(
          eq(resources.isPublished, true),
          sql`(${resources.title} ILIKE ${"%" + term + "%"} OR ${resources.summary} ILIKE ${"%" + term + "%"})`,
        ),
      )
      .orderBy(desc(resources.publishedAt))
      .limit(8);

    return rows.map(toResourceCard);
  } catch (e) {
    console.error("blog: fetchResourcesForTerm degraded (DB unavailable)", e);
    return [];
  }
}

async function fetchResourcesForTopic(topicSlug: string): Promise<ResourceCard[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const rows = await db
      .select({
        id: resources.id,
        title: resources.title,
        externalUrl: resources.externalUrl,
        summary: resources.summary,
        authors: resources.authors,
        publishedAt: resources.publishedAt,
      })
      .from(resources)
      .innerJoin(resourceTags, eq(resourceTags.resourceId, resources.id))
      .innerJoin(tags, eq(tags.id, resourceTags.tagId))
      .where(
        and(
          eq(resources.isPublished, true),
          eq(tags.category, "topic"),
          eq(tags.name, topicSlug),
        ),
      )
      .orderBy(desc(resources.publishedAt))
      .limit(20);

    return rows.map(toResourceCard);
  } catch (e) {
    console.error("blog: fetchResourcesForTopic degraded (DB unavailable)", e);
    return [];
  }
}

function toResourceCard(r: {
  id: string;
  title: string;
  externalUrl: string;
  summary: string | null;
  authors: unknown;
  publishedAt: Date | null;
}): ResourceCard {
  return {
    id: r.id,
    title: r.title,
    externalUrl: r.externalUrl,
    summary: r.summary,
    authors: Array.isArray(r.authors) ? (r.authors as string[]) : [],
    publishedYear: r.publishedAt ? new Date(r.publishedAt).getFullYear() : null,
  };
}

function termToSlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function humanReadableTopic(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
