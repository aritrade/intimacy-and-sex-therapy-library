/**
 * Crisis hotlines and clinician-handoff seed data.
 * India-first per the project brief, with a global fallback list.
 *
 * Numbers and URLs were correct at time of writing. Operators should verify
 * quarterly via the verify_at field below — we never want to surface a
 * disconnected hotline to someone in distress.
 */

export type CrisisRegion = "IN" | "US" | "UK" | "CA" | "AU" | "GLOBAL";

export type CrisisResource = {
  id: string;
  name: string;
  region: CrisisRegion;
  phone?: string;
  sms?: string;
  url?: string;
  hours: string;
  free: boolean;
  languages: string[];
  scope: Array<
    | "general_mental_health"
    | "sexual_violence"
    | "lgbtq"
    | "domestic_violence"
    | "youth"
    | "sexual_health"
  >;
  verified_at: string; // ISO date — re-check quarterly
};

export const CRISIS_RESOURCES: CrisisResource[] = [
  // India — surfaced first for any user with IN locale or IP
  {
    id: "in-tele-manas",
    name: "Tele-MANAS (Govt of India)",
    region: "IN",
    phone: "14416",
    url: "https://telemanas.mohfw.gov.in/",
    hours: "24x7",
    free: true,
    languages: ["en", "hi", "bn", "ta", "te", "kn", "ml", "mr", "gu", "or", "as", "pa"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-icall",
    name: "iCall (TISS Mumbai)",
    region: "IN",
    phone: "+91-9152987821",
    url: "https://icallhelpline.org/",
    hours: "Mon-Sat, 8am-10pm IST",
    free: true,
    languages: ["en", "hi"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-vandrevala",
    name: "Vandrevala Foundation",
    region: "IN",
    phone: "1860-2662-345",
    url: "https://www.vandrevalafoundation.com/",
    hours: "24x7",
    free: true,
    languages: ["en", "hi"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-aasra",
    name: "AASRA",
    region: "IN",
    phone: "+91-9820466726",
    url: "http://www.aasra.info/",
    hours: "24x7",
    free: true,
    languages: ["en", "hi"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-tarshi",
    name: "TARSHI (sexual & reproductive health info)",
    region: "IN",
    url: "https://www.tarshi.net/",
    hours: "Resource site (not a crisis line)",
    free: true,
    languages: ["en", "hi"],
    scope: ["sexual_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-onesafe",
    name: "One Stop Centre (Sakhi) — domestic & sexual violence",
    region: "IN",
    phone: "181",
    url: "https://wcd.nic.in/schemes/one-stop-centre-scheme-1",
    hours: "24x7",
    free: true,
    languages: ["en", "hi"],
    scope: ["sexual_violence", "domestic_violence"],
    verified_at: "2026-05-23",
  },
  {
    id: "in-mariwala",
    name: "Mariwala Health Initiative — affirming therapist directory",
    region: "IN",
    url: "https://mhi.org.in/",
    hours: "Resource site",
    free: true,
    languages: ["en"],
    scope: ["lgbtq", "general_mental_health"],
    verified_at: "2026-05-23",
  },

  // Global / multi-country
  {
    id: "us-988",
    name: "988 Suicide & Crisis Lifeline",
    region: "US",
    phone: "988",
    sms: "988",
    url: "https://988lifeline.org/",
    hours: "24x7",
    free: true,
    languages: ["en", "es"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "us-rainn",
    name: "RAINN — National Sexual Assault Hotline",
    region: "US",
    phone: "1-800-656-4673",
    url: "https://www.rainn.org/",
    hours: "24x7",
    free: true,
    languages: ["en", "es"],
    scope: ["sexual_violence"],
    verified_at: "2026-05-23",
  },
  {
    id: "us-trevor",
    name: "The Trevor Project (LGBTQ+ youth)",
    region: "US",
    phone: "1-866-488-7386",
    sms: "678-678",
    url: "https://www.thetrevorproject.org/",
    hours: "24x7",
    free: true,
    languages: ["en", "es"],
    scope: ["lgbtq", "youth"],
    verified_at: "2026-05-23",
  },
  {
    id: "uk-samaritans",
    name: "Samaritans",
    region: "UK",
    phone: "116 123",
    url: "https://www.samaritans.org/",
    hours: "24x7",
    free: true,
    languages: ["en"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
  {
    id: "global-befrienders",
    name: "Befrienders Worldwide (find your country)",
    region: "GLOBAL",
    url: "https://befrienders.org/",
    hours: "Varies by country",
    free: true,
    languages: ["en"],
    scope: ["general_mental_health"],
    verified_at: "2026-05-23",
  },
];

export function resourcesForRegion(region: CrisisRegion): CrisisResource[] {
  if (region === "IN") {
    return [
      ...CRISIS_RESOURCES.filter((r) => r.region === "IN"),
      ...CRISIS_RESOURCES.filter((r) => r.region === "GLOBAL"),
    ];
  }
  return [
    ...CRISIS_RESOURCES.filter((r) => r.region === region),
    ...CRISIS_RESOURCES.filter((r) => r.region === "GLOBAL"),
  ];
}
