/**
 * Owned newsletter list (Neon-backed, replaces Buttondown).
 *
 * Double opt-in lifecycle:
 *   pending  → (clicks confirm link) → confirmed → (clicks unsubscribe) → unsubscribed
 *
 * The email lives in our DB (source of truth). Confirm/unsub links carry an
 * opaque random token so they can't be guessed or enumerated.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { emailSubscribers } from "@/lib/db/schema";

export type SubscribeOutcome = {
  status: "pending" | "confirmed";
  confirmToken: string;
  unsubToken: string;
  /** True when the address was already confirmed (no re-send needed). */
  alreadyConfirmed: boolean;
};

function token(): string {
  return randomBytes(24).toString("hex"); // 48 chars, fits varchar(64)
}

/**
 * Idempotently create / refresh a pending subscriber. Returns the tokens so
 * the caller can build confirm + unsubscribe links. When the address is
 * already confirmed, returns `alreadyConfirmed: true` and the caller should
 * NOT send another confirmation email.
 */
export async function upsertPendingSubscriber(
  email: string,
  locale?: string,
  tags: string[] = ["website-signup"],
): Promise<SubscribeOutcome> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.query.emailSubscribers.findFirst({
    where: eq(emailSubscribers.email, normalized),
  });

  if (existing && existing.status === "confirmed") {
    return {
      status: "confirmed",
      confirmToken: existing.confirmToken,
      unsubToken: existing.unsubToken,
      alreadyConfirmed: true,
    };
  }

  const confirmToken = token();
  if (existing) {
    // pending or previously-unsubscribed → reset to pending with a fresh token.
    await db
      .update(emailSubscribers)
      .set({
        status: "pending",
        confirmToken,
        locale: locale ?? existing.locale,
        unsubscribedAt: null,
      })
      .where(eq(emailSubscribers.id, existing.id));
    return { status: "pending", confirmToken, unsubToken: existing.unsubToken, alreadyConfirmed: false };
  }

  const unsubToken = token();
  await db.insert(emailSubscribers).values({
    email: normalized,
    status: "pending",
    confirmToken,
    unsubToken,
    locale: locale ?? null,
    tags,
  });
  return { status: "pending", confirmToken, unsubToken, alreadyConfirmed: false };
}

/** Confirm a subscriber by its confirm token. Returns true on success. */
export async function confirmSubscriber(confirmToken: string): Promise<boolean> {
  if (!confirmToken) return false;
  const row = await db.query.emailSubscribers.findFirst({
    where: eq(emailSubscribers.confirmToken, confirmToken),
  });
  if (!row) return false;
  if (row.status === "confirmed") return true; // idempotent
  await db
    .update(emailSubscribers)
    .set({ status: "confirmed", confirmedAt: new Date(), unsubscribedAt: null })
    .where(eq(emailSubscribers.id, row.id));
  return true;
}

/** Unsubscribe by unsub token. Returns true if a row was matched. */
export async function unsubscribeSubscriber(unsubToken: string): Promise<boolean> {
  if (!unsubToken) return false;
  const row = await db.query.emailSubscribers.findFirst({
    where: eq(emailSubscribers.unsubToken, unsubToken),
  });
  if (!row) return false;
  await db
    .update(emailSubscribers)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(emailSubscribers.id, row.id));
  return true;
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function confirmUrl(confirmToken: string): string {
  return `${siteUrl()}/api/email/confirm?token=${encodeURIComponent(confirmToken)}`;
}

export function unsubscribeUrl(unsubToken: string): string {
  return `${siteUrl()}/api/email/unsubscribe?token=${encodeURIComponent(unsubToken)}`;
}
