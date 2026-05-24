/**
 * Shared with both the API route and the client review form, so the two
 * never drift. Adding a reason here automatically adds it to the dropdown.
 */

export const REQUEST_CHANGES_REASONS = [
  { value: "factual_inaccuracy", label: "Factual inaccuracy" },
  { value: "needs_citation", label: "Needs citation" },
  { value: "tone_off", label: "Tone is off / could moralise" },
  { value: "not_inclusive", label: "Not inclusive (LGBTQ+ / asexual / cultural)" },
  { value: "medical_overreach", label: "Medical overreach (diagnosis / dosing)" },
  { value: "scope_creep", label: "Scope creep / off-brief" },
  { value: "duplicate_content", label: "Duplicates an existing piece" },
  { value: "other", label: "Other" },
] as const;

export type RequestChangesReason = (typeof REQUEST_CHANGES_REASONS)[number]["value"];
