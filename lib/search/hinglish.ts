/**
 * Hinglish-aware query expansion.
 *
 * Romanized Hindi/Urdu vocabulary that users actually type into the search box.
 * Each entry maps a Hinglish/Hindi term (and reasonable variants) to one or more
 * English search terms used in the corpus. Curator-maintained.
 *
 * Heuristics:
 *   - Lowercase, strip diacritics, strip non-letter punctuation before lookup.
 *   - Match whole-word only (so we don't expand "shame" inside "shameful").
 *   - When we expand, we OR together: original AND (expanded OR ... OR ...).
 *
 * This is intentionally conservative — false expansions hurt precision more
 * than they help recall. Add new entries deliberately.
 */

const HINGLISH: Record<string, string[]> = {
  // Common feeling words
  sharam: ["shame"],
  sharam_aati: ["shame"],
  ghabrahat: ["anxiety"],
  chinta: ["anxiety", "worry"],
  pareshaani: ["distress", "worry"],
  takleef: ["distress", "pain"],
  dard: ["pain"],
  gussa: ["anger", "resentment"],
  udaasi: ["sadness", "depression"],
  dukh: ["grief", "sadness"],

  // Relationship concepts
  shaadi: ["marriage"],
  shaddi: ["marriage"],
  pyaar: ["love", "intimacy"],
  pyar: ["love", "intimacy"],
  rishta: ["relationship"],
  rishtey: ["relationship"],
  prem: ["love"],
  saathi: ["partner"],
  pati: ["husband", "partner"],
  patni: ["wife", "partner"],
  biwi: ["wife", "partner"],
  shauhar: ["husband", "partner"],
  jodi: ["couple"],
  parivaar: ["family"],

  // Sex / intimacy euphemisms (we DO want these to find clinical content)
  sambhog: ["sexual intercourse"],
  samaagam: ["sexual intercourse"],
  hamilakhata: ["pregnancy"],
  hum_bistari: ["intercourse"],
  yauna: ["sexual"],
  yon: ["sexual"],
  sexual: ["sexual"],

  // Common conditions
  nasbandi: ["sterilization"],
  napunsakta: ["erectile dysfunction", "impotence"],
  mardana_kamzori: ["erectile dysfunction"],
  shighrapatan: ["premature ejaculation"],
  kamzori: ["weakness"],

  // Body / anatomy
  yoni: ["vagina"],
  ling: ["penis"],
  ling_uthna: ["erection"],
  garbhashay: ["uterus"],
  stan: ["breast"],

  // Identity
  hijra: ["transgender"],
  kinnar: ["transgender"],
  samalingik: ["homosexual", "gay"],
  samlaingik: ["homosexual", "gay"],

  // Help-seeking
  ilaaj: ["treatment"],
  ilaj: ["treatment"],
  doctor_se: ["clinician", "doctor"],
  upchaar: ["treatment"],
  madad: ["help", "support"],
  saath: ["support", "support"],
  counselling: ["counselling", "therapy"],
  counseling: ["counselling", "therapy"],
};

/**
 * Expand a free-text query with Hinglish vocabulary.
 * Returns a `tsquery`-friendly OR-joined string AND additional terms array.
 *
 *   expandHinglishQuery("pati ki napunsakta")
 *     -> { expanded: "pati OR husband OR partner napunsakta OR erectile dysfunction OR impotence",
 *          extraTerms: ["husband", "partner", "erectile dysfunction", "impotence"] }
 */
export function expandHinglishQuery(input: string): {
  expanded: string;
  extraTerms: string[];
} {
  const normalized = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]+/gu, " ");

  const tokens = normalized.split(/\s+/).filter(Boolean);
  const expandedTokens: string[] = [];
  const extras = new Set<string>();

  for (const t of tokens) {
    const expansions = HINGLISH[t];
    if (expansions && expansions.length > 0) {
      expandedTokens.push([t, ...expansions].join(" OR "));
      expansions.forEach((e) => extras.add(e));
    } else {
      expandedTokens.push(t);
    }
  }

  return {
    expanded: expandedTokens.join(" "),
    extraTerms: [...extras],
  };
}
