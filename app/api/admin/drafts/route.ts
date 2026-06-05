import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentDrafts, resources } from "@/lib/db/schema";
import { generateScript, ScriptRefusal } from "@/lib/social/script-generator";
import { retrieveEvidence } from "@/lib/social/grounding";
import { requireApiAdmin } from "@/lib/auth/api-admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/admin/drafts          - list latest drafts (admin only)
 * POST /api/admin/drafts          - create a draft from a brief; runs the
 *                                   script generator and stores the result as
 *                                   `script_draft`. Does NOT render or post.
 */
export async function GET() {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ drafts: [], note: "DATABASE_URL not set" });
  }
  const rows = await db
    .select()
    .from(contentDrafts)
    .orderBy(desc(contentDrafts.createdAt))
    .limit(50);
  return NextResponse.json({ drafts: rows });
}

const PostBody = z.object({
  brief: z.string().min(8).max(2000),
  language: z.enum(["en", "hi", "hinglish"]).default("en"),
  durationSeconds: z.number().int().min(15).max(600).default(60),
  resourceId: z.string().uuid().optional(),
  kind: z.enum(["reel", "short", "feed", "carousel", "long_form"]).default("reel"),
  style: z.enum(["typography", "stock", "carousel", "long_form_essay"]).optional(),
});

export async function POST(req: Request) {
  const guard = await requireApiAdmin();
  if (guard instanceof NextResponse) return guard;
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "db_not_configured", detail: "DATABASE_URL is not set." },
      { status: 503 },
    );
  }
  const json = await req.json().catch(() => null);
  const parsed = PostBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }
  const { brief, language, durationSeconds, resourceId, kind, style } = parsed.data;
  const inferredStyle =
    style ??
    (kind === "carousel" ? "carousel" : kind === "long_form" ? "long_form_essay" : "typography");

  // Optionally pull the source resource for citation
  let resource:
    | { title: string; authors?: string[]; year?: number; sourceName: string; url: string }
    | undefined;
  if (resourceId) {
    const row = await db
      .select({
        title: resources.title,
        authors: resources.authors,
        publishedAt: resources.publishedAt,
        externalUrl: resources.externalUrl,
      })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);
    if (row[0]) {
      resource = {
        title: row[0].title,
        authors: (row[0].authors as string[]) ?? [],
        year: row[0].publishedAt ? new Date(row[0].publishedAt).getFullYear() : undefined,
        sourceName: "source",
        url: row[0].externalUrl,
      };
    }
  }

  // Ground the script in the validated corpus (soft policy).
  const grounding = await retrieveEvidence({ briefText: brief });

  let script;
  try {
    script = await generateScript({
      brief,
      language,
      durationSeconds,
      resource,
      style: inferredStyle,
      evidence: { chunks: grounding.chunks, citation: grounding.citation },
    });
  } catch (e) {
    if (e instanceof ScriptRefusal) {
      return NextResponse.json({ error: "refusal", reason: e.reason }, { status: 422 });
    }
    return NextResponse.json({ error: "generation_failed", detail: String((e as Error).message) }, { status: 500 });
  }

  const inserted = await db
    .insert(contentDrafts)
    .values({
      kind,
      language,
      brief,
      scriptMd: serialiseScriptToMd(script),
      resourceId: resourceId ?? null,
      status: "script_draft",
      grounding: {
        chunkIds: grounding.chunks.map((c) => c.chunkId),
        sources: grounding.sources.map((s) => ({ title: s.title, url: s.url, year: s.year })),
        score: grounding.score,
        lowGrounding: grounding.lowGrounding,
      },
    })
    .returning();

  return NextResponse.json({ draft: inserted[0], script }, { status: 201 });
}

function serialiseScriptToMd(s: ReturnType<typeof Object.assign>): string {
  const obj = s as {
    hook: string;
    body: Array<{ text: string; seconds: number }>;
    cta: string;
    caption: string;
    hashtags: string[];
    citationLine: string | null;
    durationSeconds: number;
  };
  return [
    `# Hook\n${obj.hook}`,
    `# Body`,
    obj.body.map((b, i) => `${i + 1}. (${b.seconds}s) ${b.text}`).join("\n"),
    `# CTA\n${obj.cta}`,
    `# Caption\n${obj.caption}`,
    `# Hashtags\n${obj.hashtags.join(" ")}`,
    obj.citationLine ? `# Citation\n${obj.citationLine}` : "",
    `# Duration\n${obj.durationSeconds}s`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
