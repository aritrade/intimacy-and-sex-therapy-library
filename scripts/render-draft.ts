/**
 * Render a draft locally to /public/renders/<id>/video.mp4.
 *
 *   npm run render -- <draftId>
 *
 * Loads the draft from the DB, parses its scriptMd, runs the full
 * TTS → Remotion → Whisper pipeline, and updates the row with videoUrl,
 * voiceoverUrl, captionsSrt, and status="rendered".
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { contentDrafts } from "../lib/db/schema";
import { renderDraft } from "../lib/social/render";
import type { GeneratedScript } from "../lib/social/script-generator";

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: npm run render -- <draftId>");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }

  const rows = await db.select().from(contentDrafts).where(eq(contentDrafts.id, id)).limit(1);
  const draft = rows[0];
  if (!draft) {
    console.error(`Draft ${id} not found`);
    process.exit(1);
  }
  if (!draft.scriptMd) {
    console.error("Draft has no script. Generate one first.");
    process.exit(1);
  }

  const script = parseScriptMd(draft.scriptMd);

  const result = await renderDraft({
    draftId: draft.id,
    script,
    language: draft.language as "en" | "hi" | "hinglish",
  });

  await db
    .update(contentDrafts)
    .set({
      videoUrl: result.publicVideoUrl,
      voiceoverUrl: result.publicVoiceoverUrl,
      captionsSrt: result.captionsSrt,
      status: "rendered",
    })
    .where(eq(contentDrafts.id, draft.id));

  console.log("");
  console.log("[render] OK");
  console.log("  video    :", result.publicVideoUrl);
  console.log("  voice    :", result.publicVoiceoverUrl ?? "(none)");
  console.log("  drift    :", result.drift ?? "(no whisper)");
  console.log("  duration :", result.totalSeconds, "s");
  process.exit(0);
}

function parseScriptMd(md: string): GeneratedScript {
  const get = (h: string) => {
    const re = new RegExp(`# ${h}\\n([\\s\\S]*?)(?:\\n# |$)`);
    return md.match(re)?.[1].trim() ?? "";
  };
  const hook = get("Hook");
  const cta = get("CTA");
  const caption = get("Caption");
  const citationLine = get("Citation") || null;
  const hashtags = get("Hashtags").split(/\s+/).filter(Boolean);
  const durationStr = get("Duration").replace(/s$/, "");
  const duration = Number(durationStr) || 60;
  const body = get("Body")
    .split(/\n/)
    .map((line) => {
      const m = line.match(/^\d+\.\s*\((\d+(?:\.\d+)?)s\)\s*(.+)$/);
      return m ? { seconds: Number(m[1]), text: m[2] } : null;
    })
    .filter((x): x is { seconds: number; text: string } => x !== null);

  return {
    hook,
    body,
    cta,
    caption,
    hashtags,
    citationLine,
    warning: null,
    durationSeconds: duration,
  };
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
