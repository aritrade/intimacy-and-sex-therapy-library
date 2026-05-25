/**
 * Render a draft locally to /public/renders/<id>/video.mp4.
 *
 *   npm run render -- <draftId> [--style typography|stock|avatar|long_form_essay]
 *
 * Loads the draft from the DB, parses its scriptMd, runs the full
 * TTS → (optional Replicate avatar) → Remotion → Whisper pipeline,
 * and updates the row with videoUrl, voiceoverUrl, captionsSrt, and
 * status="rendered". Default style is "avatar" which automatically
 * falls back to "stock" if REPLICATE_API_TOKEN is unset or the daily
 * cap is exceeded.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { contentDrafts } from "../lib/db/schema";
import { renderDraft, type RenderInput } from "../lib/social/render";
import type { GeneratedScript } from "../lib/social/script-generator";

type Style = NonNullable<RenderInput["style"]>;
const KNOWN_STYLES: Style[] = ["typography", "stock", "avatar", "long_form_essay"];

function parseArgs(argv: string[]): { id?: string; style?: Style } {
  const args: { id?: string; style?: Style } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--style" && argv[i + 1]) {
      const s = argv[++i] as Style;
      if (!KNOWN_STYLES.includes(s)) {
        console.error(`Unknown --style "${s}". Must be one of: ${KNOWN_STYLES.join(", ")}`);
        process.exit(2);
      }
      args.style = s;
    } else if (!a.startsWith("--") && !args.id) {
      args.id = a;
    }
  }
  return args;
}

async function main() {
  const { id, style } = parseArgs(process.argv.slice(2));
  if (!id) {
    console.error("Usage: npm run render -- <draftId> [--style typography|stock|avatar|long_form_essay]");
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
    style,
  });

  // Status transition rules:
  //   - script_draft / clinician_reviewed → rendered (normal v1 flow:
  //     render happens between the two approval gates)
  //   - rendered → rendered (re-render keeps status)
  //   - editor_reviewed / scheduled / published → KEEP existing status
  //     (re-rendering must not silently undo approvals or republish)
  const preserveStatuses = new Set([
    "editor_reviewed",
    "scheduled",
    "published",
  ]);
  const nextStatus = preserveStatuses.has(draft.status) ? draft.status : "rendered";

  await db
    .update(contentDrafts)
    .set({
      videoUrl: result.publicVideoUrl,
      voiceoverUrl: result.publicVoiceoverUrl,
      captionsSrt: result.captionsSrt,
      status: nextStatus,
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
