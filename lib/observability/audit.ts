/**
 * Content-free audit + crisis-event writers.
 *
 * Compliance posture: we never store the user's prompt, the model's reply,
 * or any fragment of either. Only:
 *
 *   crisis_events    — sessionFingerprint (sha256 prefix), surface, category, ts
 *   audit_log        — actorHash (sha256 prefix), action verb, structured meta
 *                      (which is run through the scrubber on the way in)
 *
 * Both are best-effort: a DB outage, a missing DATABASE_URL, or a query
 * failure must NEVER abort the user-facing request. We log a single
 * structured warning via the observability logger and move on.
 */

import { db } from "@/lib/db/client";
import { auditLog, crisisEvents } from "@/lib/db/schema";
import { hashForCorrelation, scrubObject } from "./scrub";
import { log } from "./logger";

export type CrisisSurface = "chat" | "companion";

export async function recordCrisisEvent(input: {
  surface: CrisisSurface;
  category: string;
  fingerprint: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.insert(crisisEvents).values({
      sessionFingerprint: hashForCorrelation(input.fingerprint),
      surface: input.surface,
      category: input.category.slice(0, 32),
    });
  } catch (err) {
    log.warn("crisis_event_write_failed", { err: (err as Error).message });
  }
}

export async function recordCrisisEvents(input: {
  surface: CrisisSurface;
  categories: string[];
  fingerprint: string;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  if (input.categories.length === 0) return;
  try {
    const fp = hashForCorrelation(input.fingerprint);
    await db.insert(crisisEvents).values(
      input.categories.map((c) => ({
        sessionFingerprint: fp,
        surface: input.surface,
        category: c.slice(0, 32),
      })),
    );
  } catch (err) {
    log.warn("crisis_event_write_failed", { err: (err as Error).message });
  }
}

/**
 * One row per consequential action (publish, approve, takedown, forget-me,
 * ingest-batch). `meta` is scrubbed before insertion so a careless caller
 * cannot leak a prompt by accident.
 */
export async function recordAudit(input: {
  /**
   * Stable identifier for the actor — typically the userId for signed-in
   * admins, or a fingerprint for Basic-auth ops. We hash it on the way in
   * so the audit log itself doesn't carry raw IDs.
   */
  actor: string;
  action: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await db.insert(auditLog).values({
      actorHash: hashForCorrelation(input.actor),
      action: input.action.slice(0, 64),
      meta: input.meta ? (scrubObject(input.meta) as Record<string, unknown>) : null,
    });
  } catch (err) {
    log.warn("audit_write_failed", { action: input.action, err: (err as Error).message });
  }
}
