/**
 * GET /api/admin/feedback.csv?days=30&category=improvement
 *
 * Streams the windowed user_feedback rows as CSV. Admin-gated.
 */

import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import { feedbackView, rowsToCsv } from "@/lib/admin/dashboard-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days")) || 30;
  const category = url.searchParams.get("category") ?? undefined;

  const view = await feedbackView({ windowDays: days, limit: 10_000, category });

  const csv = rowsToCsv(
    view.rows.map((r) => ({
      created_at: r.createdAt.toISOString(),
      email: r.email,
      category: r.category,
      locale: r.locale ?? "",
      source_path: r.sourcePath ?? "",
      message: r.message,
    })),
    ["created_at", "email", "category", "locale", "source_path", "message"],
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="feedback-${days}d${category ? `-${category}` : ""}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
