import { NextResponse } from "next/server";
import { z } from "zod";
import { writeConsent, readConsent } from "@/lib/compliance/consent";
import { OPTIONAL_PURPOSES } from "@/lib/compliance/dpdp";

const PostBody = z.object({
  grants: z.record(z.string(), z.boolean()),
});

export async function GET() {
  return NextResponse.json({
    purposes: OPTIONAL_PURPOSES.map((p) => ({
      id: p.id,
      version: p.version,
      description: p.description,
      retention_days: p.retention_days,
    })),
    current: readConsent(),
  });
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const record = writeConsent(parsed.data.grants);
  return NextResponse.json({ ok: true, record });
}
