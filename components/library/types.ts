/**
 * Serializable, client-safe shape for a library item. The server page maps the
 * richer DB `LibraryItem` down to this before handing it to client components
 * (search, shelves, saved/continue lists).
 */
export type LibItem = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  authors: string[];
  summary: string | null;
  tagNames: string[];
  sourceName: string;
  readTimeMin: number | null;
  readableInline: boolean;
  publishedAtMs: number | null;
  /** Where a click goes: inline reader for OA/full-text, else resource detail. */
  href: string;
};

export const KIND_LABEL: Record<string, string> = {
  article: "Article",
  book: "Book",
  guideline: "Clinical guideline",
  worksheet: "Worksheet",
  video: "Video",
  report: "Report",
  podcast_episode: "Podcast",
};

export const KIND_PILL: Record<string, string> = {
  article: "pill-accent",
  book: "pill-coral",
  guideline: "pill-accent",
  worksheet: "pill-accent",
  video: "pill-coral",
  report: "pill-coral",
  podcast_episode: "pill",
};
