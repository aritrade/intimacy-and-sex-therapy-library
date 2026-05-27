/**
 * GET /api/admin/subscribers.csv
 *
 * Streams the live Buttondown subscriber list as CSV. Admin-gated.
 *
 * Pulls all pages from Buttondown (default page size 100). Returns
 * 503 if BUTTONDOWN_API_KEY is unset.
 */

import { NextResponse } from "next/server";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";
import { rowsToCsv } from "@/lib/admin/dashboard-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ButtondownSub = {
  email_address?: string;
  creation_date?: string;
  tags?: string[];
  subscriber_type?: string;
};

export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;

  const key = process.env.BUTTONDOWN_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "buttondown_not_configured" },
      { status: 503 },
    );
  }

  const all: ButtondownSub[] = [];
  let next: string | null =
    "https://api.buttondown.email/v1/subscribers?ordering=-creation_date";
  // Hard ceiling so we never accidentally make 100k calls from a bug.
  const MAX_PAGES = 100;
  let pages = 0;
  while (next && pages < MAX_PAGES) {
    const res = await fetch(next, {
      headers: { Authorization: `Token ${key}` },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "buttondown_failed", status: res.status, detail: (await res.text()).slice(0, 200) },
        { status: 502 },
      );
    }
    const j = (await res.json()) as { next?: string | null; results?: ButtondownSub[] };
    all.push(...(j.results ?? []));
    next = j.next ?? null;
    pages++;
  }

  const csv = rowsToCsv(
    all.map((s) => ({
      created_at: s.creation_date ?? "",
      email: s.email_address ?? "",
      subscriber_type: s.subscriber_type ?? "",
      tags: (s.tags ?? []).join("|"),
    })),
    ["created_at", "email", "subscriber_type", "tags"],
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="subscribers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
