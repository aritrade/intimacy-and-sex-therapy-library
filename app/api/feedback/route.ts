/**
 * POST /api/feedback   { email, message, category, locale?, sourcePath?, website? }
 *
 * Public homepage feedback endpoint. Unlike /api/email/subscribe (which
 * proxies to Buttondown and keeps email out of our DB), this DOES persist
 * the email + message — the submitter is explicitly opting in to be
 * contactable about their feedback. The privacy notice on the form makes
 * this clear.
 *
 * Anti-abuse:
 *   - Honeypot `website` field — bots fill it, get a 200, never persist.
 *   - sha256(ip + FEEDBACK_IP_PEPPER) truncated stored as ip_hash for
 *     in-memory rate limit (1 submission per IP per 30 min).
 *   - Body size cap via Zod (.max(2000) on message).
 *
 * 503 when DATABASE_URL is unset so the form gracefully degrades.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { userFeedback } from "@/lib/db/schema";
import { recordAudit } from "@/lib/observability/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email().max(320),
  message: z.string().min(4).max(2000),
  category: z.enum(["improvement", "praise", "bug", "other"]).default("other"),
  locale: z.string().max(8).optional(),
  sourcePath: z.string().max(200).optional(),
  /** Honeypot: if filled, silently 200 — bots get fooled. */
  website: z.string().optional(),
});

// In-memory per-IP rate limit. One submission per IP per 30 min. Lives
// for the lifetime of the serverless function instance (Vercel recycles
// these every few minutes idle, so the limit is mostly a "no double-tap"
// guard, not a DDoS shield).
const RATE_LIMIT_MS = 30 * 60 * 1000;
const lastSeen = new Map<string, number>();

function hashIp(ip: string): string {
  const pepper = process.env.FEEDBACK_IP_PEPPER ?? "fallback-pepper-do-not-rely-on";
  return createHash("sha256").update(`${ip}|${pepper}`).digest("hex").slice(0, 32);
}

function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { email, message, category, locale, sourcePath, website } = parsed.data;
  if (website) {
    return NextResponse.json({ ok: true, honeypotted: true });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }

  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const now = Date.now();
  const last = lastSeen.get(ipHash) ?? 0;
  if (now - last < RATE_LIMIT_MS) {
    const waitMin = Math.ceil((RATE_LIMIT_MS - (now - last)) / 60_000);
    return NextResponse.json(
      {
        error: "rate_limited",
        detail: `Please wait ~${waitMin} more minute${waitMin === 1 ? "" : "s"} before submitting again.`,
      },
      { status: 429 },
    );
  }
  lastSeen.set(ipHash, now);

  try {
    await db.insert(userFeedback).values({
      email,
      message,
      category,
      locale: locale ?? null,
      ipHash,
      sourcePath: sourcePath ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "insert_failed", detail: String((e as Error).message).slice(0, 200) },
      { status: 500 },
    );
  }

  const fingerprint = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 16);
  void recordAudit({
    actor: "public:feedback",
    action: "feedback_submitted",
    meta: { fingerprint, category, locale: locale ?? null, length: message.length },
  });

  return NextResponse.json({ ok: true });
}
