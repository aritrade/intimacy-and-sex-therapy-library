/**
 * POST /api/track   { path, ref? }
 *
 * In-app, privacy-first page-view logger. Reads Vercel's edge geo headers
 * (country / region / city granularity only — NO IP, NO user id) and stores
 * one row per view in `page_views`. Used by the admin analytics "Site traffic"
 * section. Fails soft: any error returns 204 so the beacon never surfaces an
 * error to the visitor.
 *
 * Runs in the Node runtime (Postgres write); middleware.ts doesn't gate it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { pageViews } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  path: z.string().min(1).max(512),
  ref: z.string().max(2048).optional(),
});

const BOT_RX =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|vkshare|whatsapp|telegram|headless|lighthouse|monitor|curl|wget|python-requests|axios|node-fetch/i;

function deviceType(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet|playbook|silk/i.test(ua)) return "tablet";
  if (/mobi|iphone|android.*mobile|phone/i.test(ua)) return "mobile";
  return "desktop";
}

function refHost(ref: string | undefined, selfHost: string | null): string | null {
  if (!ref) return null;
  try {
    const u = new URL(ref);
    const host = u.hostname.toLowerCase();
    // Drop same-site referrers — they're navigation, not acquisition.
    if (selfHost && host === selfHost.toLowerCase()) return null;
    return host.slice(0, 255);
  } catch {
    return null;
  }
}

/** Strip query/hash and bound length so paths stay low-cardinality + PII-free. */
function cleanPath(path: string): string {
  const noQuery = path.split(/[?#]/)[0] || "/";
  return noQuery.slice(0, 512);
}

export async function POST(req: Request) {
  try {
    if (!process.env.DATABASE_URL) return new NextResponse(null, { status: 204 });

    const json = await req.json().catch(() => null);
    const parsed = Body.safeParse(json);
    if (!parsed.success) return new NextResponse(null, { status: 204 });

    const h = headers();
    const ua = h.get("user-agent") ?? "";
    const isBot = ua === "" || BOT_RX.test(ua);

    // Optional sampling to cap row volume on the free tier. Default: keep all.
    const sample = Number(process.env.PAGEVIEW_SAMPLE ?? 1);
    if (!isBot && sample < 1 && Math.random() > sample) {
      return new NextResponse(null, { status: 204 });
    }

    const country = h.get("x-vercel-ip-country");
    const region = h.get("x-vercel-ip-country-region");
    const city = h.get("x-vercel-ip-city");
    const selfHost = h.get("host");

    await db.insert(pageViews).values({
      path: cleanPath(parsed.data.path),
      referrerHost: refHost(parsed.data.ref, selfHost),
      country: country ? country.slice(0, 2) : null,
      region: region ? region.slice(0, 8) : null,
      city: city ? decodeURIComponent(city).slice(0, 120) : null,
      deviceType: deviceType(ua),
      isBot,
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Never let analytics break a page load.
    return new NextResponse(null, { status: 204 });
  }
}
