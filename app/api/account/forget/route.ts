import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  assessmentResults,
  userPathProgress,
  sessions,
  userRoles,
  users,
  vaultEntries,
} from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/roles";
import { signOut } from "@/lib/auth/auth";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/account/forget
 *
 * Hard-deletes all per-user data tied to the signed-in user. The order
 * matters: child rows first, then the user. Most are ON DELETE CASCADE so
 * deleting `users` would suffice, but we delete explicitly so the audit
 * log clearly reflects each table touched.
 *
 * Compliance: DPDP Act 2023 §13 right to erasure / GDPR Article 17.
 */
export async function DELETE() {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const userId = gate.userId;

  await db.transaction(async (tx) => {
    await tx.delete(assessmentResults).where(eq(assessmentResults.userId, userId));
    await tx.delete(userPathProgress).where(eq(userPathProgress.userId, userId));
    await tx.delete(vaultEntries).where(eq(vaultEntries.userId, userId));
    await tx.delete(userRoles).where(eq(userRoles.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  void recordAudit({
    actor: userId,
    action: "user_right_to_erasure",
    // We do not record any user attributes here — the action verb itself is
    // the only thing that should be retained for compliance evidence.
    meta: {},
  });

  // Sign the user out — the JWT becomes orphaned without a backing user row,
  // and we don't want stale role claims lingering in their cookie.
  await signOut({ redirect: false });

  return NextResponse.json({ ok: true });
}
