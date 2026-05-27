/**
 * Canonical source allowlist. The ingestion pipeline rejects anything not
 * referenced by an entry in this list. Add a source here only if it satisfies:
 *
 *   1. Institutional accountability (a clinical body, government health
 *      authority, peer-reviewed journal, accredited university, or an official
 *      channel of one of those).
 *   2. Authored or signed by credentialed clinicians/researchers — not by
 *      anonymous bloggers, influencers, or affiliate-marketing sites.
 *   3. Either openly licensed (CC, public domain, government work, PMC OA) so
 *      we can ingest full text, OR a reputable publisher we can deep-link to
 *      with metadata + curator notes only.
 */

export type AllowlistKind =
  | "journal"
  | "clinical_body"
  | "university"
  | "health_authority"
  | "publisher"
  | "video_channel"
  | "podcast"
  | "ngo"
  | "government";

export type AllowlistTier = "tier_1" | "tier_2" | "tier_3";

export type AllowlistSource = {
  slug: string;
  name: string;
  kind: AllowlistKind;
  url: string;
  trustTier: AllowlistTier;
  notes?: string;
  /**
   * Lowercase substrings that count as a match against an upstream
   * record's publisher / channel / source field. The discovery agent
   * uses this when a third-party API (Open Library, Crossref) gives us
   * publisher strings that differ from `name` in punctuation, suffix
   * ("Press", "Publishing", "Inc."), or region. Always provide at least
   * the canonical short brand name in lowercase.
   */
  aliases?: string[];
};

export const ALLOWLIST: AllowlistSource[] = [
  // ---------------------------------------------------------------------
  // Tier 1: clinical bodies & professional associations
  // ---------------------------------------------------------------------
  {
    slug: "aasect",
    name: "American Association of Sexuality Educators, Counselors and Therapists",
    kind: "clinical_body",
    url: "https://www.aasect.org/",
    trustTier: "tier_1",
    notes: "Position statements, certification standards, public resources.",
  },
  {
    slug: "wpath",
    name: "World Professional Association for Transgender Health",
    kind: "clinical_body",
    url: "https://wpath.org/",
    trustTier: "tier_1",
    notes: "SOC8 is CC BY-NC-ND — full text ingestable with attribution.",
  },
  {
    slug: "isswsh",
    name: "International Society for the Study of Women's Sexual Health",
    kind: "clinical_body",
    url: "https://www.isswsh.org/",
    trustTier: "tier_1",
  },
  {
    slug: "essm",
    name: "European Society for Sexual Medicine",
    kind: "clinical_body",
    url: "https://www.essm.org/",
    trustTier: "tier_1",
  },
  {
    slug: "sstar",
    name: "Society for Sex Therapy and Research",
    kind: "clinical_body",
    url: "https://sstarnet.org/",
    trustTier: "tier_1",
  },
  {
    slug: "bashh",
    name: "British Association for Sexual Health and HIV",
    kind: "clinical_body",
    url: "https://www.bashh.org/",
    trustTier: "tier_1",
  },
  {
    slug: "kinsey-institute",
    name: "The Kinsey Institute",
    kind: "clinical_body",
    url: "https://kinseyinstitute.org/",
    trustTier: "tier_1",
  },
  {
    slug: "gottman-institute",
    name: "The Gottman Institute (research)",
    kind: "clinical_body",
    url: "https://www.gottman.com/",
    trustTier: "tier_1",
    notes: "Peer-reviewed research papers only; commercial program pages excluded.",
  },
  {
    slug: "apa",
    name: "American Psychological Association",
    kind: "clinical_body",
    url: "https://www.apa.org/",
    trustTier: "tier_1",
  },
  {
    slug: "acog",
    name: "American College of Obstetricians and Gynecologists",
    kind: "clinical_body",
    url: "https://www.acog.org/",
    trustTier: "tier_1",
  },
  {
    slug: "csepi",
    name: "Council of Sex Education and Parenthood International (India)",
    kind: "ngo",
    url: "https://csepi.org.in/",
    trustTier: "tier_1",
  },
  {
    slug: "tarshi",
    name: "TARSHI — Talking About Reproductive and Sexual Health Issues",
    kind: "ngo",
    url: "https://www.tarshi.net/",
    trustTier: "tier_1",
  },

  // ---------------------------------------------------------------------
  // Tier 1: government / health authorities
  // ---------------------------------------------------------------------
  { slug: "who", name: "World Health Organization", kind: "health_authority", url: "https://www.who.int/", trustTier: "tier_1" },
  { slug: "nih", name: "U.S. National Institutes of Health", kind: "health_authority", url: "https://www.nih.gov/", trustTier: "tier_1" },
  { slug: "ncbi-bookshelf", name: "NCBI Bookshelf", kind: "health_authority", url: "https://www.ncbi.nlm.nih.gov/books/", trustTier: "tier_1" },
  { slug: "cdc", name: "Centers for Disease Control and Prevention", kind: "health_authority", url: "https://www.cdc.gov/", trustTier: "tier_1" },
  { slug: "nhs", name: "UK National Health Service", kind: "health_authority", url: "https://www.nhs.uk/", trustTier: "tier_1" },
  { slug: "nice", name: "National Institute for Health and Care Excellence (UK)", kind: "health_authority", url: "https://www.nice.org.uk/", trustTier: "tier_1" },
  { slug: "mohfw", name: "Ministry of Health and Family Welfare (India)", kind: "government", url: "https://main.mohfw.gov.in/", trustTier: "tier_1" },
  { slug: "fpa-india", name: "Family Planning Association of India", kind: "ngo", url: "https://fpaindia.org/", trustTier: "tier_1" },
  { slug: "mayo-clinic", name: "Mayo Clinic", kind: "health_authority", url: "https://www.mayoclinic.org/", trustTier: "tier_1" },
  { slug: "cleveland-clinic", name: "Cleveland Clinic", kind: "health_authority", url: "https://my.clevelandclinic.org/", trustTier: "tier_1" },
  { slug: "planned-parenthood", name: "Planned Parenthood", kind: "ngo", url: "https://www.plannedparenthood.org/", trustTier: "tier_1" },
  { slug: "rainn", name: "RAINN — Rape, Abuse & Incest National Network", kind: "ngo", url: "https://www.rainn.org/", trustTier: "tier_1" },
  { slug: "trevor-project", name: "The Trevor Project", kind: "ngo", url: "https://www.thetrevorproject.org/", trustTier: "tier_1" },
  { slug: "mariwala", name: "Mariwala Health Initiative (India)", kind: "ngo", url: "https://mhi.org.in/", trustTier: "tier_1" },

  // ---------------------------------------------------------------------
  // Tier 1: peer-reviewed open-access journals (full-text ingestable)
  // ---------------------------------------------------------------------
  { slug: "pmc-oa", name: "PubMed Central Open Access subset", kind: "journal", url: "https://www.ncbi.nlm.nih.gov/pmc/", trustTier: "tier_1", notes: "Use Europe PMC API; license gate on each article (CC-BY*, CC0, public domain only)." },
  { slug: "plos-one", name: "PLOS ONE", kind: "journal", url: "https://journals.plos.org/plosone/", trustTier: "tier_1" },
  { slug: "bmc-womens-health", name: "BMC Women's Health", kind: "journal", url: "https://bmcwomenshealth.biomedcentral.com/", trustTier: "tier_1" },
  { slug: "sexual-medicine-oa", name: "Sexual Medicine (Oxford OA)", kind: "journal", url: "https://academic.oup.com/smoa", trustTier: "tier_1" },
  { slug: "jmir", name: "Journal of Medical Internet Research", kind: "journal", url: "https://www.jmir.org/", trustTier: "tier_1" },

  // ---------------------------------------------------------------------
  // Tier 2: universities (educational pages, OA repositories)
  // ---------------------------------------------------------------------
  { slug: "stanford-sparq", name: "Stanford SPARQ", kind: "university", url: "https://sparq.stanford.edu/", trustTier: "tier_2" },
  { slug: "harvard-health", name: "Harvard Health Publishing", kind: "university", url: "https://www.health.harvard.edu/", trustTier: "tier_2" },
  { slug: "johns-hopkins", name: "Johns Hopkins Medicine", kind: "university", url: "https://www.hopkinsmedicine.org/", trustTier: "tier_2" },
  { slug: "ucsf", name: "UCSF Health", kind: "university", url: "https://www.ucsfhealth.org/", trustTier: "tier_2" },
  { slug: "umich-shc", name: "University of Michigan Sexual Health Certificate", kind: "university", url: "https://sexualhealth.med.umich.edu/", trustTier: "tier_2" },
  { slug: "cornell-health", name: "Cornell Health (Cornell University)", kind: "university", url: "https://health.cornell.edu/", trustTier: "tier_2" },

  // ---------------------------------------------------------------------
  // Tier 2: publishers — METADATA + DEEP LINKS ONLY (no full-text host).
  // We never store copyrighted full text. These exist so the catalog can
  // surface a book with cover art, ToC, blurb, curator notes, and links to
  // the publisher / Google Books / WorldCat / Libby.
  // ---------------------------------------------------------------------
  { slug: "norton", name: "W. W. Norton (publisher)", kind: "publisher", url: "https://wwnorton.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["w. w. norton", "w.w. norton", "ww norton", "norton", "norton & company"] },
  { slug: "guilford", name: "Guilford Press", kind: "publisher", url: "https://www.guilford.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["guilford", "guilford press", "guilford publications"] },
  { slug: "routledge", name: "Routledge / Taylor & Francis", kind: "publisher", url: "https://www.routledge.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["routledge", "taylor & francis", "taylor and francis"] },
  { slug: "harpercollins", name: "HarperCollins (publisher)", kind: "publisher", url: "https://www.harpercollins.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["harpercollins", "harper collins", "harper & row"] },
  { slug: "simon-schuster", name: "Simon & Schuster (publisher)", kind: "publisher", url: "https://www.simonandschuster.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["simon & schuster", "simon and schuster", "atria"] },
  { slug: "rowman-littlefield", name: "Rowman & Littlefield (publisher)", kind: "publisher", url: "https://rowman.com/", trustTier: "tier_2", notes: "Metadata + links only.", aliases: ["rowman & littlefield", "rowman and littlefield", "lexington books"] },
  { slug: "crucible4points", name: "Crucible 4 Points — Dr. David Schnarch (author site)", kind: "publisher", url: "https://www.crucible4points.com/", trustTier: "tier_2", notes: "Author's official site for the Crucible Approach books.", aliases: ["crucible 4 points", "schnarch"] },

  // ---------------------------------------------------------------------
  // Tier 1: video channels — we ingest transcripts via the official
  // YouTube API only, and embed via the official iframe player.
  // ---------------------------------------------------------------------
  { slug: "ted", name: "TED / TEDx (official)", kind: "video_channel", url: "https://www.youtube.com/@TED", trustTier: "tier_1" },
  { slug: "esther-perel", name: "Esther Perel (official)", kind: "video_channel", url: "https://www.youtube.com/@EstherPerelOfficial", trustTier: "tier_1" },
  { slug: "gottman-yt", name: "The Gottman Institute (YouTube)", kind: "video_channel", url: "https://www.youtube.com/@GottmanInstitute", trustTier: "tier_1" },
  { slug: "nhs-yt", name: "NHS (YouTube)", kind: "video_channel", url: "https://www.youtube.com/@NHS", trustTier: "tier_1" },
  { slug: "mayo-clinic-yt", name: "Mayo Clinic (YouTube)", kind: "video_channel", url: "https://www.youtube.com/@mayoclinic", trustTier: "tier_1" },
];

/**
 * Hosts that the ingestion pipeline must REFUSE outright, even if a curator
 * tries to add them. Catches obvious abuse — actual review still happens
 * per-resource via the license + author-credentials check.
 */
export const HARD_BLOCKLIST: ReadonlyArray<RegExp> = [
  /(^|\.)tiktok\.com$/i,
  /(^|\.)onlyfans\.com$/i,
  /(^|\.)pornhub\.com$/i,
  /(^|\.)xvideos\.com$/i,
  /(^|\.)reddit\.com$/i,
  /(^|\.)medium\.com$/i, // anyone can publish; admit only via direct author whitelist
  /(^|\.)substack\.com$/i, // same as above
];

export function isAllowlisted(hostname: string): boolean {
  return ALLOWLIST.some((src) => {
    try {
      const u = new URL(src.url);
      return u.hostname === hostname || hostname.endsWith("." + u.hostname);
    } catch {
      return false;
    }
  });
}

export function isHardBlocked(hostname: string): boolean {
  return HARD_BLOCKLIST.some((re) => re.test(hostname));
}

/**
 * Resolve an upstream publisher string (e.g. from Open Library or
 * Crossref) to the corresponding allowlist entry. Matches the lowercase
 * field against each entry's `aliases` first (most reliable), then the
 * brand-token portion of `name` (substring containment, defensive
 * fallback). Returns `null` when the publisher isn't allowlisted.
 */
export function publisherToAllowlist(
  publisherField: string | null | undefined,
): AllowlistSource | null {
  if (!publisherField) return null;
  const p = publisherField.toLowerCase().trim();
  if (!p) return null;
  for (const src of ALLOWLIST) {
    if (src.kind !== "publisher") continue;
    if (src.aliases && src.aliases.some((a) => p.includes(a))) return src;
    // Fallback: match the slug as a token (e.g. "guilford" appears in any
    // string Open Library returns for Guilford Press).
    if (p.includes(src.slug.toLowerCase())) return src;
  }
  return null;
}
