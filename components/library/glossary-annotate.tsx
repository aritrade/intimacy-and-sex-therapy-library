import { Fragment, type ReactNode } from "react";
import glossary from "@/content/glossary.json";

/**
 * In-reader glossary linking. Wraps the FIRST mention of each known glossary
 * term (or a sufficiently distinctive alias) in a dotted-underline link to the
 * /glossary anchor, with the plain-language definition as a hover tooltip.
 *
 * Runs entirely server-side (pure function → ReactNode), so it adds no client
 * JS. Callers thread a shared `linked` Set across paragraphs so each term is
 * annotated only once per document.
 */

type Entry = { term: string; aka?: string[]; plain: string };

function anchorId(term: string): string {
  return term.toLowerCase().replace(/\s+/g, "-");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Phrase = { id: string; def: string };

// Build the phrase → {anchor, definition} lookup once at module load.
const { lookup, regex } = (() => {
  const entries = glossary.entries as Entry[];
  const map = new Map<string, Phrase>();
  const phrases: string[] = [];

  for (const e of entries) {
    const id = anchorId(e.term);
    const def = e.plain.length > 240 ? `${e.plain.slice(0, 237)}…` : e.plain;
    // Always include the canonical term; include aliases only when distinctive
    // (≥5 chars) to avoid false positives on short abbreviations (ED, PE, ace…).
    const candidates = [e.term, ...(e.aka ?? []).filter((a) => a.length >= 5)];
    for (const c of candidates) {
      const key = c.toLowerCase();
      if (map.has(key)) continue; // first definition wins on collision
      map.set(key, { id, def });
      phrases.push(c);
    }
  }

  // Longest first so multi-word terms win over any contained shorter phrase.
  phrases.sort((a, b) => b.length - a.length);
  const re = new RegExp(`\\b(${phrases.map(escapeRegex).join("|")})\\b`, "gi");
  return { lookup: map, regex: re };
})();

export function annotateGlossary(text: string, linked: Set<string>): ReactNode {
  if (!text) return text;
  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Fresh lastIndex per call (module-level regex is stateful with /g).
  regex.lastIndex = 0;

  for (const m of text.matchAll(regex)) {
    const matched = m[0];
    const info = lookup.get(matched.toLowerCase());
    if (!info || linked.has(info.id)) continue; // only the first mention, once per term
    linked.add(info.id);

    const start = m.index ?? 0;
    if (start > last) out.push(<Fragment key={`t${key++}`}>{text.slice(last, start)}</Fragment>);
    out.push(
      <a
        key={`g${key++}`}
        href={`/glossary#${info.id}`}
        title={info.def}
        className="border-b border-dotted border-accent/50 text-ink-900 transition-colors hover:text-accent-ink"
      >
        {matched}
      </a>,
    );
    last = start + matched.length;
  }

  if (last === 0) return text; // nothing matched — return the raw string
  if (last < text.length) out.push(<Fragment key={`t${key++}`}>{text.slice(last)}</Fragment>);
  return out;
}
