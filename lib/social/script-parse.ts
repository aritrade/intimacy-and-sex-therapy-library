/**
 * Inverse of the `serialiseScriptToMd` writer in app/api/admin/drafts/route.ts.
 *
 * We split a generated script back into structured sections so the clinician
 * review UI can show each piece independently. We deliberately tolerate
 * partial / corrupted scripts: every field is optional in the result, and
 * unknown headers fall through into `extraSections` so the reviewer can still
 * see them rather than silently losing them.
 *
 * The serialiser uses these top-level headers (in order):
 *
 *   # Hook
 *   # Body
 *   # CTA
 *   # Caption
 *   # Hashtags
 *   # Citation        (optional)
 *   # Duration
 *
 * Everything between two `# ` headers is the content of the previous header.
 */

export type ParsedBeat = { index: number; seconds?: number; text: string };

export type ParsedScript = {
  hook?: string;
  body: ParsedBeat[];
  cta?: string;
  caption?: string;
  hashtags: string[];
  citation?: string;
  durationSeconds?: number;
  extraSections: Array<{ header: string; content: string }>;
};

const KNOWN_HEADERS = ["Hook", "Body", "CTA", "Caption", "Hashtags", "Citation", "Duration"] as const;
type KnownHeader = (typeof KNOWN_HEADERS)[number];
const KNOWN_LOOKUP = new Set<string>(KNOWN_HEADERS as readonly string[]);

const EMPTY: ParsedScript = {
  body: [],
  hashtags: [],
  extraSections: [],
};

export function parseScript(md: string | null | undefined): ParsedScript {
  if (!md || typeof md !== "string") return { ...EMPTY };

  // Split on lines that start with "# " followed by a heading word. We use
  // a manual scan rather than a regex split so the body of `# Body` (which
  // contains numbered lines) doesn't get mistakenly chunked.
  const lines = md.split("\n");
  type Section = { header: string; lines: string[] };
  const sections: Section[] = [];
  let cur: Section | null = null;

  for (const raw of lines) {
    const m = raw.match(/^#\s+(.+?)\s*$/);
    if (m) {
      if (cur) sections.push(cur);
      cur = { header: m[1].trim(), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(raw);
    // Lines BEFORE the first header are dropped; the serialiser never emits
    // any, so this is fine.
  }
  if (cur) sections.push(cur);

  const out: ParsedScript = { body: [], hashtags: [], extraSections: [] };

  for (const s of sections) {
    const content = s.lines.join("\n").trim();
    if (!KNOWN_LOOKUP.has(s.header)) {
      out.extraSections.push({ header: s.header, content });
      continue;
    }
    const header = s.header as KnownHeader;
    switch (header) {
      case "Hook":
        out.hook = content;
        break;
      case "Body":
        out.body = parseBody(content);
        break;
      case "CTA":
        out.cta = content;
        break;
      case "Caption":
        out.caption = content;
        break;
      case "Hashtags":
        out.hashtags = parseHashtags(content);
        break;
      case "Citation":
        out.citation = content;
        break;
      case "Duration":
        out.durationSeconds = parseDuration(content);
        break;
    }
  }

  return out;
}

function parseBody(content: string): ParsedBeat[] {
  // Each beat looks like: "1. (5s) some on-screen text"
  // We tolerate missing parens, missing seconds, or different list markers.
  const out: ParsedBeat[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^(\d+)[.)]\s*(?:\((\d+)s\)\s*)?(.+)$/);
    if (m) {
      out.push({
        index: Number(m[1]),
        seconds: m[2] ? Number(m[2]) : undefined,
        text: m[3].trim(),
      });
    } else if (/^[-*]\s+/.test(trimmed)) {
      out.push({
        index: out.length + 1,
        text: trimmed.replace(/^[-*]\s+/, ""),
      });
    } else {
      out.push({ index: out.length + 1, text: trimmed });
    }
  }
  return out;
}

function parseHashtags(content: string): string[] {
  return content
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith("#") && s.length >= 3);
}

function parseDuration(content: string): number | undefined {
  const m = content.match(/(\d+)\s*s?/);
  return m ? Number(m[1]) : undefined;
}

/**
 * Total spoken word count across hook + body + cta. Useful for the review UI
 * to display "≈ N words spoken" alongside the duration target.
 */
export function spokenWordCount(parsed: ParsedScript): number {
  const parts = [parsed.hook ?? "", parsed.cta ?? "", ...parsed.body.map((b) => b.text)];
  return parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
}
