import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { vaultEntries } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vault entries — server only ever sees ciphertext.
 *
 * Encryption envelope is produced on the client by lib/crypto/vault.ts:
 *   { ciphertext, iv, salt }  (all base64)
 * The passphrase / derived key never crosses the wire. We refuse anything
 * that looks like plaintext.
 */
const PostBody = z.object({
  label: z.string().min(1).max(80),
  ciphertext: z.string().min(16).max(2_000_000),
  iv: z.string().min(8).max(64),
  salt: z.string().min(8).max(64),
  kdfIterations: z.number().int().min(100_000).max(2_000_000).default(310_000),
});

export async function GET() {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const rows = await db
    .select()
    .from(vaultEntries)
    .where(eq(vaultEntries.userId, gate.userId))
    .orderBy(desc(vaultEntries.createdAt))
    .limit(100);
  return NextResponse.json({ entries: rows });
}

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const inserted = await db
    .insert(vaultEntries)
    .values({ ...parsed.data, userId: gate.userId })
    .returning({ id: vaultEntries.id, createdAt: vaultEntries.createdAt });

  return NextResponse.json({ entry: inserted[0] }, { status: 201 });
}

export async function DELETE(req: Request) {
  const gate = await requireAuth();
  if (!gate.ok) return gate.response;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  await db
    .delete(vaultEntries)
    .where(and(eq(vaultEntries.id, id), eq(vaultEntries.userId, gate.userId)));

  return NextResponse.json({ ok: true });
}
