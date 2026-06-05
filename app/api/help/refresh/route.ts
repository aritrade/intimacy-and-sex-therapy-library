/**
 * POST /api/help/refresh   { kind, country, state?, locality?, specialty?, topic?, scope?, affirming? }
 *
 * Forces a live re-fetch for a Find Help query, bypassing the cache and
 * updating the cached row. The client then calls router.refresh() to re-render
 * the page from the freshly-updated cache. Rate-limited (live searches cost
 * web-search quota), anonymous, fails soft.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ratelimit";
import { searchClinicians, searchCommunities, type CommunityScope } from "@/lib/help/search";
import type { AffirmingFilter } from "@/lib/help/taxonomy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_AFFIRMING: AffirmingFilter[] = ["lgbtq", "trans", "ace"];
const VALID_SCOPE: CommunityScope[] = ["local", "online", "both"];

const Body = z.object({
  kind: z.enum(["clinicians", "communities"]),
  country: z.string().min(2).max(4),
  state: z.string().max(96).optional(),
  locality: z.string().max(96).optional(),
  specialty: z.string().max(64).optional(),
  topic: z.string().max(64).optional(),
  scope: z.string().max(12).optional(),
  affirming: z.string().max(64).optional(),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

function parseAffirming(raw: string | undefined): AffirmingFilter[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is AffirmingFilter => (VALID_AFFIRMING as string[]).includes(s));
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  // Tight limit: live refreshes are the expensive path.
  const rl = await rateLimit({ key: `help-refresh:${ip(req)}`, limit: 8, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const d = parsed.data;
  const affirming = parseAffirming(d.affirming);

  try {
    if (d.kind === "clinicians") {
      if (!d.specialty) return NextResponse.json({ error: "missing_specialty" }, { status: 400 });
      const out = await searchClinicians({
        country: d.country,
        state: d.state,
        locality: d.locality,
        specialtyId: d.specialty,
        affirming,
        force: true,
      });
      return NextResponse.json({ ok: true, count: out.results.length });
    }

    if (!d.topic) return NextResponse.json({ error: "missing_topic" }, { status: 400 });
    const scope: CommunityScope = (VALID_SCOPE as string[]).includes(d.scope ?? "")
      ? (d.scope as CommunityScope)
      : "both";
    const out = await searchCommunities({
      country: d.country,
      state: d.state,
      locality: d.locality,
      topicId: d.topic,
      scope,
      affirming,
      force: true,
    });
    return NextResponse.json({ ok: true, count: out.results.length });
  } catch {
    return NextResponse.json({ error: "refresh_failed" }, { status: 502 });
  }
}
