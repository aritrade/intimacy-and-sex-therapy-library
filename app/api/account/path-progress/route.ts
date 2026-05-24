import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { userPathProgress } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  pathSlug: z.string().min(2).max(64),
  stepIndex: z.number().int().min(0).max(99),
});

/**
 * POST /api/account/path-progress
 *
 * Marks a step as completed for the signed-in user. Idempotent — primary
 * key is (userId, pathSlug, stepIndex), and we ON CONFLICT DO NOTHING.
 */
export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { pathSlug, stepIndex } = parsed.data;

  await db
    .insert(userPathProgress)
    .values({ userId: gate.userId, pathSlug, stepIndex })
    .onConflictDoNothing();

  return NextResponse.json({ ok: true }, { status: 201 });
}

/**
 * DELETE /api/account/path-progress?pathSlug=...&stepIndex=...
 *
 * Optional un-mark — useful for "I'm not done with this step actually".
 */
export async function DELETE(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("pathSlug");
  const idx = Number(url.searchParams.get("stepIndex"));
  if (!slug || Number.isNaN(idx)) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  await db.execute(
    sql`delete from ${userPathProgress} where user_id = ${gate.userId} and path_slug = ${slug} and step_index = ${idx}`,
  );
  return NextResponse.json({ ok: true });
}
