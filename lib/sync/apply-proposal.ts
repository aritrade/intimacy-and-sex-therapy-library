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
      // New-resource requires the ingest pipeline to run with the
      // candidate metadata; we surface a hint instead of doing it
      // inline because ingestion is multi-step (fetch + parse +
      // chunk + embed). Operators trigger ingest manually using the
      // metadata captured in the proposal payload.
      return {
        ok: false,
        error: "manual_step_required",
        detail: {
          hint:
            "Add the source to lib/seed/curated-resources.ts (or run the ingest pipeline directly with this metadata), then re-seed.",
          payload: args.payload,
        },
      };
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

