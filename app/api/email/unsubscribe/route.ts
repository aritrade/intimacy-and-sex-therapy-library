/**
 * Unsubscribe endpoint.
 *
 *   GET  /api/email/unsubscribe?token=...   — link in the footer; redirects
 *                                             to a confirmation page.
 *   POST /api/email/unsubscribe?token=...   — RFC 8058 one-click (triggered by
 *                                             the List-Unsubscribe-Post header
 *                                             from Gmail/Yahoo); returns 200.
 *
 * Both are idempotent and never reveal whether the token matched a real row.
 */

import { NextResponse } from "next/server";
import { unsubscribeSubscriber } from "@/lib/email/subscribers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tokenFrom(req: Request): string {
  return new URL(req.url).searchParams.get("token") ?? "";
}

export async function GET(req: Request) {
  await unsubscribeSubscriber(tokenFrom(req));
  return NextResponse.redirect(new URL("/email/unsubscribed", req.url));
}

export async function POST(req: Request) {
  // List-Unsubscribe-Post one-click: body may carry token too, but the query
  // param is what we put in the List-Unsubscribe URL.
  let token = tokenFrom(req);
  if (!token) {
    const form = await req.formData().catch(() => null);
    token = (form?.get("token") as string) ?? "";
  }
  await unsubscribeSubscriber(token);
  return new NextResponse(null, { status: 200 });
}
