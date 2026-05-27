/**
 * Streaming publish endpoint.
 *
 * Wire format: NDJSON (one JSON event per line, `\n`-terminated).
 *
 * The client (`components/admin/PublishProgress.tsx`) opens this route
 * with `fetch()` + a `ReadableStream` reader, parses each line as a
 * `ProgressEvent`, and renders per-platform progress rows live as the
 * publish flows through container_create -> warmup -> publish_attempt
 * -> done.
 *
 * Why NDJSON and not SSE: SSE would let us use the browser's
 * `EventSource`, but `EventSource` is GET-only. We need POST (with
 * the platforms + attestation body), so a streaming fetch is cleaner.
 *
 * Auth: same `requireApiAdmin` gate as the JSON `/publish` route.
 * Status machine: same `PUBLISHABLE_STATUSES` gate. On success the
 * DB row is mutated by `publishDraft` exactly as the JSON route would.
 *
 * Why this exists alongside the JSON route:
 *   - The JSON `/publish` route still exists and is used by callers
 *     that don't care about granular progress (cron, scripts/_oneoff).
 *   - The streaming variant is used by the admin UI for live UX.
 *   - Same orchestrator (`publishDraft`) under the hood; the only
 *     difference is whether `onEvent` is wired.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts } from "@/lib/db/schema";
import { publishDraft } from "@/lib/social/publish";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import type { ProgressEvent } from "@/lib/social/publish-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Same headroom as the JSON publish route — the streaming endpoint
// runs the SAME publishDraft under the hood, so worst-case duration
// is identical.
export const maxDuration = 300;

const Body = z.object({
  platforms: z
    .array(z.enum(["instagram", "youtube", "facebook", "linkedin", "twitter"]))
    .min(1),
  iAmTheReviewerAndIWantToPublish: z.literal(true),
});

const PUBLISHABLE_STATUSES = new Set([
  "editor_reviewed",
  "scheduled",
  "posted",
  "failed",
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const { platforms } = parsed.data;

  const draft = await db.query.contentDrafts.findFirst({
    where: eq(contentDrafts.id, params.id),
  });
  if (!draft) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!PUBLISHABLE_STATUSES.has(draft.status)) {
    return NextResponse.json(
      {
        error: "not_approved",
        detail:
          "Draft is not approved for publishing. Both clinician and editor approvals are required first.",
        current: draft.status,
      },
      { status: 409 },
    );
  }

  // Build the NDJSON stream. We push events into a TransformStream's
  // writable side from the publishDraft `onEvent` callback; the
  // readable side becomes the HTTP response body.
  //
  // Order of operations:
  //   1) Send a single "ready" line so the client immediately knows the
  //      backend accepted the request (avoids the false-positive feel
  //      of a 30s SSL handshake silence).
  //   2) Run publishDraft, forwarding each event as one NDJSON line.
  //   3) Record audit + close the writer.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const write = (obj: unknown) =>
    writer.write(encoder.encode(JSON.stringify(obj) + "\n"));

  // Kick off the publish in the background; do NOT await before returning
  // the Response. Vercel will keep the function alive until the writer
  // closes OR maxDuration elapses, whichever comes first.
  (async () => {
    try {
      await write({ event: "ready" });
      const result = await publishDraft({
        draftId: params.id,
        platforms,
        onEvent: (e: ProgressEvent) => {
          // Best-effort fire-and-forget; if the client disconnected the
          // write rejects silently and the next ones do too — that's fine.
          void write(e);
        },
      });
      void recordAudit({
        actor: await getActor(req),
        action: result.ok ? "draft_publish_succeeded" : "draft_publish_failed",
        meta: {
          draftId: params.id,
          platforms,
          successPlatforms: Object.keys(result.platformPostIds),
          failureCount: result.failures.length,
          skipped: result.skipped,
          variant: "stream",
        },
      });
    } catch (e) {
      // Top-level safety net — publishDraft itself shouldn't throw
      // (publishers throw caught-inside-the-loop refusals), but if
      // something explodes, surface it as a terminal stream event.
      await write({
        event: "done",
        ok: false,
        platformPostIds: {},
        failures: [
          {
            platform: "all",
            reason: "orchestrator_exception",
            detail: String((e as Error).message).slice(0, 400),
          },
        ],
        skipped: [],
        totalDurationMs: 0,
      });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      // Disable proxy buffering so events arrive at the browser as
      // soon as the writer flushes them (Cloudflare in front of Vercel
      // honours this; Vercel itself doesn't buffer ndjson responses).
      "X-Accel-Buffering": "no",
    },
  });
}
