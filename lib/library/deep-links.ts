/**
 * Authorized deep-links for "metadata-only" library entries.
 *
 * For copyrighted books we never host the PDF. Instead we show the user
 * official ways to read or buy: the publisher page, Google Books, Open
 * Library (a borrowable scan), and WorldCat (find a nearby library).
 *
 * Every URL here is constructed from the item's title + first author —
 * we never store the URLs (they may break) and we never render content
 * on our domain. Each link opens in a new tab.
 */

export type DeepLink = {
  label: string;
  href: string;
  /** Brief explainer that hovers as a tooltip. */
  hint: string;
};

function q(s: string): string {
  return encodeURIComponent(s.trim());
}

/**
 * Returns the authorized deep-links for a library item.
 * `publisherUrl` is the canonical publisher / source URL we already have.
 */
export function buildLibraryDeepLinks(opts: {
  title: string;
  authors: string[];
  publisherUrl?: string | null;
  publisherName?: string | null;
}): DeepLink[] {
  const { title, authors, publisherUrl, publisherName } = opts;
  const author = authors[0] ?? "";
  const titleAuthor = author ? `${title} ${author}` : title;

  const links: DeepLink[] = [];

  if (publisherUrl) {
    links.push({
      label: publisherName ? `Open at ${publisherName}` : "Open at publisher",
      href: publisherUrl,
      hint: "Authorized publisher page — buy or read sample chapters.",
    });
  }

  links.push({
    label: "Google Books",
    href: `https://www.google.com/books/edition/_/?hl=en&q=${q(titleAuthor)}`,
    hint: "Preview, search inside, or buy via Google Books.",
  });

  links.push({
    label: "Open Library",
    href: `https://openlibrary.org/search?q=${q(titleAuthor)}`,
    hint: "Borrow a digital scan for free if available (Internet Archive lending).",
  });

  links.push({
    label: "Find at a library",
    href: `https://www.worldcat.org/search?q=${q(titleAuthor)}`,
    hint: "WorldCat — locate a nearby library that has this title.",
  });

  return links;
}
