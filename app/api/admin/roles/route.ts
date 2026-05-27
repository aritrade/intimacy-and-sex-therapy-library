/**
 * Role management API. Admin-only.
 *
 *   POST   /api/admin/roles  body: { userId, role }    — grant
 *   DELETE /api/admin/roles  body: { userId, role }    — revoke
 *
 * Safety rails:
 *
 *   - Cannot demote the LAST admin in the system. Demoting yourself is
 *     allowed as long as another admin exists.
 *   - Cannot grant the `user` role explicitly — every authenticated user is
 *     implicitly a "user".
 *   - Every change writes a content-free audit row.
 *
 * The middleware already enforces an admin session for /api/admin/*, but we
 * defence-in-depth check via `requireRole("admin")` here too.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userRoles, users } from "@/lib/db/schema";
import { requireRole } from "@/lib/auth/roles";
import { recordAudit } from "@/lib/observability/audit";
import { getActor } from "@/lib/admin/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RoleSchema = z.enum(["viewer", "clinician", "editor", "admin"]);
const Body = z.object({
  userId: z.string().uuid(),
  role: RoleSchema,
});

async function ensureCallerIsAdmin() {
  const guard = await requireRole("admin");
  if (!guard.ok) return guard.response;
  return null;
}

async function adminCount(): Promise<number> {
  const rows = (await db.execute(
    sql`select count(*)::int as n from user_roles where role = 'admin'`,
  )) as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

export async function POST(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const refusal = await ensureCallerIsAdmin();
  if (refusal) return refusal;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { userId, role } = parsed.data;

  const userRow = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!userRow) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  await db
    .insert(userRoles)
    .values({ userId, role })
    .onConflictDoNothing();

  void recordAudit({
    actor: await getActor(req),
    action: "role_grant",
    meta: { targetUserId: userId, role },
  });

  return NextResponse.json({ ok: true, granted: { userId, role } });
}

export async function DELETE(req: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const refusal = await ensureCallerIsAdmin();
  if (refusal) return refusal;

  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { userId, role } = parsed.data;

  // Last-admin rail: refuse if this would leave the system with zero admins.
  if (role === "admin") {
    const adminsBefore = await adminCount();
    const targetIsAdmin = await db
      .select({ role: userRoles.role })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.role, "admin")))
      .limit(1);
    if (targetIsAdmin.length > 0 && adminsBefore <= 1) {
      return NextResponse.json(
        {
          error: "last_admin",
          detail:
            "Refusing to demote the last admin. Promote another user to admin first, then retry.",
        },
        { status: 409 },
      );
    }
  }

  await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.role, role)));

  void recordAudit({
    actor: await getActor(req),
    action: "role_revoke",
    meta: { targetUserId: userId, role },
  });

  return NextResponse.json({ ok: true, revoked: { userId, role } });
}
