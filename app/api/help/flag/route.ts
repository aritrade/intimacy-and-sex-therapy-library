/**
 * POST /api/help/flag   { ref, cacheKey?, reason? }
 *
 * Records a user "Report" on an aggregated result. Stored unhidden; an admin
 * decides whether to hide it globally (see /admin/help-flags). Rate-limited,
 * anonymous, fails soft.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { helpResultFlags } from "@/lib/db/schema";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  ref: z.string().min(1).max(256),
  cacheKey: z.string().max(128).optional(),
  reason: z.string().max(48).optional(),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL) return new NextResponse(null, { status: 204 });
    const rl = await rateLimit({ key: `help-flag:${ip(req)}`, limit: 20, windowMs: 60_000 });
    if (!rl.ok) return new NextResponse(null, { status: 429 });

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

    await db.insert(helpResultFlags).values({
      resultRef: parsed.data.ref,
      cacheKey: parsed.data.cacheKey ?? null,
      reason: parsed.data.reason ?? null,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
