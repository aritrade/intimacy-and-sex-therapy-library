/**
 * User invite API. Admin-only.
 *
 *   POST /api/admin/users/invite
 *     body: { email: string, roles: Role[] }
 *
 * Behaviour:
 *   - If a user row already exists for `email`, grants any new roles to it
 *     (existing role grants are left untouched — idempotent).
 *   - If no user row exists, pre-creates one with just the email and grants
 *     the requested roles. When the invited person eventually signs in via
 *     magic-link or OAuth, Auth.js's Drizzle adapter resolves them by email,
 *     reuses the row, and their roles are already in place.
 *   - "Admin" can be granted via invite; the safety rail that prevents
 *     demoting the last admin only fires on revoke (DELETE /api/admin/roles),
 *     not on grants.
 *
 * Audit: every successful invite writes a `user_invite` row with the email
 * and granted roles. Email is the identifier the inviter typed in; we
 * don't consider it personal-data-redacted because the invite IS about
 * that email.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userRoles, users } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RoleSchema = z.enum(["viewer", "clinician", "editor", "admin"]);
const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  roles: z.array(RoleSchema).min(1).max(4),
});

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const refusal = await requireRole("admin");
  if (!refusal.ok) return refusal.response;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { email, roles } = parsed.data;
  const uniqueRoles = Array.from(new Set(roles));

  const actor = await getActor(req);

  // Find-or-create the user row by email.
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  let userId: string;
  let created = false;
  if (existing) {
    userId = existing.id;
  } else {
    const [row] = await db.insert(users).values({ email }).returning({ id: users.id });
    if (!row) {
      return NextResponse.json({ error: "user_create_failed" }, { status: 500 });
    }
    userId = row.id;
    created = true;
  }

  // Insert the requested role grants; idempotent via the (user_id, role) PK.
  if (uniqueRoles.length > 0) {
    await db
      .insert(userRoles)
      .values(uniqueRoles.map((role) => ({ userId, role })))
      .onConflictDoNothing();
  }

  void recordAudit({
    actor,
    action: "user_invite",
    meta: { email, roles: uniqueRoles, created },
  });

  return NextResponse.json({
    ok: true,
    user: { id: userId, email, created },
    granted: uniqueRoles,
  });
}
