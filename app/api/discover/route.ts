/**
 * POST /api/discover   { q, force? }
 *
 * Runs (or force-refreshes) a Library Discover query and updates the cache. The
 * client then calls router.refresh() to re-render the page from the freshly
 * cached result. Rate-limited (Discover hits live scholarly APIs + the LLM),
 * anonymous, fails soft.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ratelimit";
import { getDiscover } from "@/lib/discover/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  q: z.string().min(2).max(200),
  force: z.boolean().optional(),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  // Forced refreshes are the expensive path (live APIs + LLM); limit tightly.
  const limit = parsed.data.force ? 6 : 20;
  const rl = await rateLimit({ key: `discover:${ip(req)}`, limit, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const out = await getDiscover(parsed.data.q, parsed.data.force ?? false);
    return NextResponse.json({
      ok: true,
      count: out.result.sources.length,
      cached: out.cached,
    });
  } catch {
    return NextResponse.json({ error: "discover_failed" }, { status: 502 });
  }
}
