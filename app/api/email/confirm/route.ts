/**
 * GET /api/email/confirm?token=...
 *
 * Double opt-in confirmation landing. Flips the subscriber to `confirmed`
 * and redirects to a friendly confirmation page. Invalid/expired tokens
 * redirect with ?status=invalid (we never reveal whether a token existed).
 */

import { NextResponse } from "next/server";
import { confirmSubscriber } from "@/lib/email/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const ok = await confirmSubscriber(token);
  const dest = new URL(ok ? "/email/confirmed" : "/email/confirmed?status=invalid", req.url);
  return NextResponse.redirect(dest);
}
