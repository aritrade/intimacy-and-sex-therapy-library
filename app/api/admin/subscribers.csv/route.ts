/**
 * GET /api/admin/subscribers.csv
 *
 * Streams the owned, confirmed subscriber list (email_subscribers) as CSV.
 * Admin-gated. Only confirmed addresses are exported — that's the list you'd
 * actually mail. Returns 503 when DATABASE_URL is unset.
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import { rowsToCsv } from "@/lib/admin/dashboard-stats";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const rows = (await db.execute(sql`
    select email, status, created_at, confirmed_at, tags
      from email_subscribers
     where status = 'confirmed'
     order by confirmed_at desc nulls last, created_at desc
  `)) as unknown as Array<{
    email: string;
    status: string;
    created_at: string;
    confirmed_at: string | null;
    tags: unknown;
  }>;

  const csv = rowsToCsv(
    rows.map((s) => ({
      email: s.email,
      status: s.status,
      created_at: s.created_at ?? "",
      confirmed_at: s.confirmed_at ?? "",
      tags: Array.isArray(s.tags) ? (s.tags as string[]).join("|") : "",
    })),
    ["email", "status", "created_at", "confirmed_at", "tags"],
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
