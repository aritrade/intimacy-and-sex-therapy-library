/**
 * GET /api/help/locations?level=state|locality&country=IN&state=&q=
 *
 * Powers the cascading Country > State > Locality field.
 *   - level=state    -> static states for the country (India-first taxonomy).
 *   - level=locality -> Google Places city autocomplete (when configured),
 *                       biased to the country; falls back to [] otherwise.
 *
 * Anonymous + rate-limited by IP hash. No user data stored.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/ratelimit";
import { countryComponent, statesForCountry } from "@/lib/help/taxonomy";
import { localityAutocomplete, placesConfigured } from "@/lib/providers/places";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  level: z.enum(["state", "locality"]),
  country: z.string().min(2).max(4),
  state: z.string().max(96).optional(),
  q: z.string().max(96).optional(),
});

function ip(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = Query.safeParse({
    level: searchParams.get("level"),
    country: searchParams.get("country"),
    state: searchParams.get("state") ?? undefined,
    q: searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const rl = await rateLimit({ key: `help-loc:${ip(req)}`, limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ options: [] }, { status: 429 });

  const { level, country, state, q } = parsed.data;

  if (level === "state") {
    return NextResponse.json({ options: statesForCountry(country) });
  }

  // locality
  if (!placesConfigured() || !q || q.trim().length < 2) {
    return NextResponse.json({ options: [], configured: placesConfigured() });
  }
  const input = state ? `${q}, ${state}` : q;
  const preds = await localityAutocomplete({
    input,
    countryComponent: countryComponent(country),
    limit: 6,
  }).catch(() => []);
  return NextResponse.json({ options: preds.map((p) => p.description), configured: true });
}
