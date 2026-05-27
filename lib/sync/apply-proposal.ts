/**
 * Apply an approved proposal.
 *
 * For each kind we hand-roll the mutation because the catalog has
 * other constraints (tag rows, search index refresh, ingestion
 * pipeline) that a generic JSON-merge wouldn't honour.
 *
 * All mutations are best-effort idempotent — re-applying the same
 * approved proposal must not create duplicates.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resources } from "@/lib/db/schema";
import { sourceIdForSlug } from "./discovery";
import { slugify } from "@/lib/utils";

export type ApplyResult =
  | { ok: true; detail: Record<string, unknown> }
  | { ok: false; error: string; detail?: Record<string, unknown> };

export async function applyProposal(args: {
  kind: string;
  resourceId: string | null;
  payload: Record<string, unknown>;
}): Promise<ApplyResult> {
  switch (args.kind) {
    case "fix_url":
      return applyFixUrl(args.resourceId, args.payload);
    case "needs_refresh":
      return applyNeedsRefresh(args.resourceId, args.payload);
    case "remove_resource":
      return applyRemoveResource(args.resourceId);
    case "metadata_drift":
      return applyMetadataDrift(args.resourceId, args.payload);
    case "new_resource":
      return applyNewResource(args.payload);
    default:
      return { ok: false, error: `unknown_kind:${args.kind}` };
  }
}

async function applyFixUrl(
  resourceId: string | null,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  if (!resourceId) return { ok: false, error: "missing_resource_id" };
  const newUrl = String(payload.newUrl ?? "");
  if (!newUrl.startsWith("http")) {
    return { ok: false, error: "invalid_new_url", detail: { newUrl } };
  }
  await db
    .update(resources)
    .set({ externalUrl: newUrl, updatedAt: new Date() })
    .where(eq(resources.id, resourceId));
  return { ok: true, detail: { resourceId, newUrl } };
}

async function applyNeedsRefresh(
  resourceId: string | null,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  // We don't auto-refresh; we just stamp `updated_at` and surface a
  // note in `curator_notes`. The actual refresh requires a human to
  // re-ingest the resource (read the new abstract, possibly update
  // tags). The proposal is "applied" in the sense that we've tracked
  // the acknowledgement.
  if (!resourceId) return { ok: false, error: "missing_resource_id" };
  const reason = String(payload.reason ?? "stale");
  const note = `[freshness:${reason}] flagged ${new Date().toISOString().slice(0, 10)}`;
  await db
    .update(resources)
    .set({
      updatedAt: new Date(),
      curatorNotes: sql`COALESCE(${resources.curatorNotes}, '') || ${`\n${note}`}`,
    })
    .where(eq(resources.id, resourceId));
  return { ok: true, detail: { resourceId, note } };
}

async function applyRemoveResource(resourceId: string | null): Promise<ApplyResult> {
  if (!resourceId) return { ok: false, error: "missing_resource_id" };
  // Soft-remove: set isPublished=false and stamp curator_notes. We
  // never hard-delete from this path because audit/compliance want
  // history. A separate hard-delete tool exists for GDPR / takedown.
  const note = `[link-health] unpublished ${new Date().toISOString().slice(0, 10)} — link unreachable`;
  await db
    .update(resources)
    .set({
      isPublished: false,
      updatedAt: new Date(),
      curatorNotes: sql`COALESCE(${resources.curatorNotes}, '') || ${`\n${note}`}`,
    })
    .where(eq(resources.id, resourceId));
  return { ok: true, detail: { resourceId, action: "unpublished" } };
}

/**
 * Apply a `new_resource` discovery proposal by inserting an UNPUBLISHED
 * row in `resources`. The curator decides when to publish (set
 * `is_published = true`) once they've added tags, license, and review.
 *
 * Why unpublished by default: the discovery agent is a strong filter
 * but it's not editorial review. We don't want a single click to
 * promote an article we haven't read straight to the public catalog.
 *
 * Idempotent: if a row with the same `external_url` already exists we
 * reuse it instead of failing on the unique constraint.
 */
async function applyNewResource(
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const sourceSlug =
    typeof payload.sourceSlug === "string" ? payload.sourceSlug : "";
  const externalUrl = typeof payload.url === "string" ? payload.url : "";
  const source =
    typeof payload.source === "string" ? (payload.source as string) : "";
  if (!title || !sourceSlug || !externalUrl) {
    return {
      ok: false,
      error: "invalid_payload",
      detail: { hint: "Missing title, sourceSlug, or url on the proposal." },
    };
  }
  if (!externalUrl.startsWith("http")) {
    return { ok: false, error: "invalid_external_url", detail: { externalUrl } };
  }

  const sourceId = await sourceIdForSlug(sourceSlug);
  if (!sourceId) {
    return {
      ok: false,
      error: "unknown_source_slug",
      detail: {
        hint: `No row in 'sources' has slug='${sourceSlug}'. Seed the source then retry.`,
      },
    };
  }

  // Idempotency: if we already have a resource at this URL, surface its id
  // and skip the insert. The proposals UI treats this as "applied" too —
  // the catalog already has it.
  const existing = await db
    .select({ id: resources.id, slug: resources.slug })
    .from(resources)
    .where(eq(resources.externalUrl, externalUrl))
    .limit(1);
  if (existing[0]) {
    return {
      ok: true,
      detail: {
        resourceId: existing[0].id,
        slug: existing[0].slug,
        action: "deduped",
      },
    };
  }

  const slug = await uniqueSlugFor(title);
  const kind = kindFromSource(source);
  const license = licenseFromSource(source, sourceSlug);
  const authors = Array.isArray(payload.authors)
    ? payload.authors.filter((a): a is string => typeof a === "string")
    : [];
  const year =
    typeof payload.publishedYear === "number" ? payload.publishedYear : null;
  const summary =
    typeof payload.abstract === "string" && payload.abstract.length > 0
      ? payload.abstract.slice(0, 4_000)
      : null;
  const note = `[discovery:${source || "unknown"}] auto-onboarded ${new Date()
    .toISOString()
    .slice(0, 10)} — unpublished, awaiting curator review.`;

  const inserted = await db
    .insert(resources)
    .values({
      slug,
      sourceId,
      kind,
      title: title.slice(0, 800),
      authors,
      authorCredentials: [],
      publishedAt: year ? new Date(Date.UTC(year, 0, 1)) : null,
      language: "en",
      license,
      fullTextAvailable: false,
      externalUrl,
      summary,
      curatorNotes: note,
      isPublished: false,
    })
    .returning({ id: resources.id, slug: resources.slug });

  return {
    ok: true,
    detail: {
      resourceId: inserted[0]?.id,
      slug: inserted[0]?.slug,
      action: "created_unpublished",
      reviewUrl: `/admin/drafts?status=script_draft`,
    },
  };
}

async function uniqueSlugFor(title: string): Promise<string> {
  const base = slugify(title).slice(0, 180) || "untitled";
  // Check up to 8 candidate slugs before giving up and falling back to a
  // random suffix. Almost always wins on the first try.
  for (let i = 0; i < 8; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.slug, candidate))
      .limit(1);
    if (taken.length === 0) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function kindFromSource(source: string): "article" | "book" {
  if (source === "open-library") return "book";
  return "article";
}

function licenseFromSource(
  source: string,
  sourceSlug: string,
): "oa_pmc" | "copyrighted" {
  // PubMed Central Open Access subset → oa_pmc. Crossref hits depend on
  // the underlying journal: we know our allowlisted OA journals
  // (plos-one, bmc-womens-health, jmir, sexual-medicine-oa) are CC-BY
  // equivalents, but defaulting to oa_pmc is fine for the curator to
  // refine later. Open Library books are metadata-only; mark copyrighted.
  if (source === "open-library") return "copyrighted";
  const oaJournalSlugs = new Set([
    "pmc-oa",
    "plos-one",
    "bmc-womens-health",
    "jmir",
    "sexual-medicine-oa",
  ]);
  if (oaJournalSlugs.has(sourceSlug)) return "oa_pmc";
  return "copyrighted";
}

async function applyMetadataDrift(
  resourceId: string | null,
  payload: Record<string, unknown>,
): Promise<ApplyResult> {
  if (!resourceId) return { ok: false, error: "missing_resource_id" };
  const field = String(payload.field ?? "");
  const suggested = payload.suggested;
  if (!field || suggested === undefined) {
    return { ok: false, error: "invalid_payload" };
  }
  // Whitelist of fields safe to auto-apply.
  const ALLOW = new Set(["title", "summary", "abstract", "language"]);
  if (!ALLOW.has(field)) {
    return { ok: false, error: `field_not_allowed:${field}` };
  }
  const update: Record<string, unknown> = { updatedAt: new Date() };
  update[field] = suggested;
  // Field is constrained to the ALLOW whitelist above; the dynamic
  // shape is therefore safe even if drizzle's type can't see it.
  await db
    .update(resources)
    .set(update as Partial<typeof resources.$inferInsert>)
    .where(eq(resources.id, resourceId));
  return { ok: true, detail: { resourceId, field } };
}

