/**
 * Render a single draft from the CLI.
 *
 *   npm run render -- <draftId> [--style typography|stock|photo|avatar|long_form_essay]
 *
 * Thin wrapper around `renderDraftAndPersist()` — the same helper the
 * GH Actions render-due cron and the admin "Render" button use. Default
 * style is "photo" (Ken-Burns stock-photo collage with kinetic captions);
 * works on the free tier without any paid AI compute.
 *
 * Status transition rules live in lib/social/render-and-persist.ts —
 * notably, rendering a `script_draft` PRESERVES the script_draft status
 * so the clinician-review guardrail isn't accidentally bypassed.
 */
import "dotenv/config";
import { renderDraftAndPersist, RenderPersistError } from "../lib/social/render-and-persist";
import type { RenderInput } from "../lib/social/render";

type Style = NonNullable<RenderInput["style"]>;
const KNOWN_STYLES: Style[] = ["typography", "stock", "photo", "avatar", "long_form_essay"];

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
    console.error("Usage: npm run render -- <draftId> [--style typography|stock|photo|avatar|long_form_essay]");
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set");
    process.exit(2);
  }

  try {
    const r = await renderDraftAndPersist(id, { style });
    console.log("");
    console.log("[render] OK");
    console.log("  status   :", r.fromStatus, "->", r.toStatus);
    console.log("  video    :", r.render.publicVideoUrl);
    console.log("  voice    :", r.render.publicVoiceoverUrl ?? "(none)");
    console.log("  drift    :", r.render.drift ?? "(no whisper)");
    console.log("  duration :", r.render.totalSeconds, "s");
    process.exit(0);
  } catch (e) {
    if (e instanceof RenderPersistError) {
      console.error(`[render] FAILED (${e.reason}): ${e.detail ?? ""}`);
      process.exit(1);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
