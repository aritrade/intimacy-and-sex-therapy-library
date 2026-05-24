/**
 * Flesch-Kincaid Grade Level. Cheap, deterministic readability heuristic
 * used as the first pass of the difficulty tagger.
 *
 * Formula: 0.39 * (words/sentences) + 11.8 * (syllables/words) - 15.59
 *
 * Returns the grade as a float. Clamped to [0, 24]. Empty input returns 0.
 */

export function fleschKincaidGrade(text: string): number {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return 0;

  const sentences = Math.max(1, (t.match(/[.!?]+/g) ?? []).length);
  const words = t.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount === 0) return 0;

  let syllables = 0;
  for (const w of words) syllables += countSyllables(w);

  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59;
  return Math.max(0, Math.min(24, +grade.toFixed(2)));
}

/**
 * Vowel-cluster syllable count. Imperfect but consistent — good enough for
 * relative readability comparisons.
 */
export function countSyllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  w = w.replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}
