/**
 * Taxonomy for the Find Help hub: clinician specialties, identity-inclusive
 * community topics, affirming filters, and an India-first country/state list.
 *
 * Inclusivity is a first-class principle here. The community topics span the
 * full spectrum of orientation, gender identity, relationship structure, and
 * disability. Nothing in this file (or the agent that consumes it) excludes or
 * de-prioritizes any identity. Everyone deserves love and intimacy.
 */

export type Specialty = {
  id: string;
  label: string;
  /** Query expansion terms handed to the search providers. */
  terms: string[];
};

export const SPECIALTIES: Specialty[] = [
  { id: "sex-therapist", label: "Sex therapist", terms: ["sex therapist", "psychosexual therapist", "AASECT certified sex therapist"] },
  { id: "sexologist", label: "Sexologist", terms: ["sexologist", "clinical sexologist"] },
  { id: "therapist", label: "Therapist / counsellor", terms: ["therapist", "psychotherapist", "counsellor", "counselor"] },
  { id: "couples-therapist", label: "Couples / relationship therapist", terms: ["couples therapist", "marriage counsellor", "relationship therapist"] },
  { id: "psychiatrist", label: "Psychiatrist", terms: ["psychiatrist", "psychiatry clinic"] },
  { id: "psychologist", label: "Psychologist", terms: ["clinical psychologist", "psychologist"] },
  { id: "gynaecologist", label: "Gynaecologist", terms: ["gynaecologist", "gynecologist", "OB-GYN"] },
  { id: "urologist", label: "Urologist", terms: ["urologist", "urology clinic"] },
  { id: "andrologist", label: "Andrologist", terms: ["andrologist", "andrology clinic", "men's sexual health"] },
  { id: "pelvic-floor-physio", label: "Pelvic-floor physiotherapist", terms: ["pelvic floor physiotherapist", "pelvic floor physical therapy"] },
  { id: "lgbtq-affirming-therapist", label: "LGBTQ+ affirming therapist", terms: ["LGBTQ affirming therapist", "queer affirmative therapist", "gay friendly therapist"] },
  { id: "trans-affirming-clinician", label: "Trans-affirming clinician", terms: ["trans affirming clinician", "gender affirming care", "transgender health clinic"] },
];

export type CommunityTopic = {
  id: string;
  label: string;
  terms: string[];
};

/**
 * Identity-inclusive community topics. Covers the full spectrum by design.
 */
export const COMMUNITY_TOPICS: CommunityTopic[] = [
  { id: "lgbtq", label: "LGBTQ+", terms: ["LGBTQ community", "queer community", "lesbian gay bisexual"] },
  { id: "transgender", label: "Transgender & non-binary", terms: ["transgender support community", "non-binary community", "trans support group"] },
  { id: "asexual", label: "Asexual / ace-spectrum", terms: ["asexual community", "ace spectrum support", "asexuality"] },
  { id: "aromantic", label: "Aromantic", terms: ["aromantic community", "aro spectrum support"] },
  { id: "demisexual", label: "Demisexual", terms: ["demisexual community", "demisexuality support"] },
  { id: "intersex", label: "Intersex", terms: ["intersex community", "intersex support group"] },
  { id: "polyamory", label: "Polyamory / ENM", terms: ["polyamory community", "ethical non-monogamy support", "open relationship community"] },
  { id: "kink-aware", label: "Kink-aware / BDSM", terms: ["kink community", "BDSM munch", "kink aware support"] },
  { id: "disability-intimacy", label: "Disability & intimacy", terms: ["disability sexuality community", "disabled intimacy support"] },
  { id: "low-desire", label: "Desire & libido", terms: ["low desire support community", "libido support group"] },
  { id: "couples", label: "Couples & relationships", terms: ["couples support community", "relationship support group"] },
  { id: "sexual-trauma", label: "Healing after trauma", terms: ["sexual trauma survivors community", "trauma support group"] },
  { id: "postpartum", label: "Postpartum & parenting", terms: ["postpartum intimacy support", "new parents relationship community"] },
  { id: "menopause", label: "Menopause & perimenopause", terms: ["menopause community", "perimenopause support group"] },
  { id: "general", label: "General intimacy & sexual health", terms: ["sexual health community", "intimacy support community"] },
];

export type AffirmingFilter = "lgbtq" | "trans" | "ace";

export const AFFIRMING_FILTERS: Array<{ id: AffirmingFilter; label: string; terms: string[] }> = [
  { id: "lgbtq", label: "LGBTQ+ affirming", terms: ["LGBTQ affirming", "queer friendly"] },
  { id: "trans", label: "Trans affirming", terms: ["trans affirming", "gender affirming"] },
  { id: "ace", label: "Ace affirming", terms: ["asexual affirming", "ace inclusive"] },
];

export type CountryDef = { code: string; label: string; states: string[] };

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi (NCT)", "Jammu & Kashmir",
  "Ladakh", "Puducherry", "Chandigarh", "Andaman & Nicobar Islands",
];

/**
 * India-first. Other countries carry a representative state/region list; the
 * locality field uses Places Autocomplete (when configured) so exhaustive
 * sub-lists aren't required.
 */
export const COUNTRIES: CountryDef[] = [
  { code: "IN", label: "India", states: INDIA_STATES },
  {
    code: "US",
    label: "United States",
    states: ["California", "New York", "Texas", "Florida", "Illinois", "Washington", "Massachusetts", "New Jersey", "Georgia", "Other"],
  },
  {
    code: "UK",
    label: "United Kingdom",
    states: ["England", "Scotland", "Wales", "Northern Ireland"],
  },
  { code: "AE", label: "UAE", states: ["Dubai", "Abu Dhabi", "Sharjah", "Other"] },
  { code: "SG", label: "Singapore", states: ["Singapore"] },
];

export function countryByCode(code: string): CountryDef | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

export function statesForCountry(code: string): string[] {
  return countryByCode(code)?.states ?? [];
}

export function specialtyById(id: string): Specialty | undefined {
  return SPECIALTIES.find((s) => s.id === id);
}

export function topicById(id: string): CommunityTopic | undefined {
  return COMMUNITY_TOPICS.find((t) => t.id === id);
}

/** Country code -> Places Autocomplete `components` country bias. */
export function countryComponent(code: string): string {
  const map: Record<string, string> = { IN: "in", US: "us", UK: "gb", AE: "ae", SG: "sg" };
  return map[code.toUpperCase()] ?? "";
}
