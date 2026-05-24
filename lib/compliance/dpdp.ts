/**
 * DPDP Act 2023 (India) + GDPR Art. 9 (special categories) primitives.
 *
 * Sexual orientation and health data fall under "Sensitive Personal Data" /
 * "Special Category Data". This module is the canonical list of processing
 * purposes; every read or write of user data MUST cite a Purpose from here.
 *
 * The check is enforced at the data-access layer in lib/db/access.ts and in
 * an eslint rule we add later. This file is the source of truth.
 */

export const PURPOSES = {
  ESSENTIAL: {
    id: "essential",
    version: 1,
    optional: false,
    legal_basis_in: "necessary_for_specified_purpose",
    legal_basis_eu: "art_6_1_b_contract",
    description:
      "Run the site (age gate, language, accessibility, security, fraud prevention).",
    retention_days: 365,
  },
  PERSONALIZATION: {
    id: "personalization",
    version: 1,
    optional: true,
    legal_basis_in: "consent",
    legal_basis_eu: "art_6_1_a_consent",
    description:
      "Bookmarks, progress on learning paths, preferred language, comfort settings.",
    retention_days: -1, // until deletion
  },
  ASSESSMENT: {
    id: "assessment",
    version: 1,
    optional: true,
    legal_basis_in: "explicit_consent",
    legal_basis_eu: "art_9_2_a_explicit_consent",
    description:
      "Persist validated self-assessment scores (FSFI, IIEF-5, GRISS, etc.) so you can compare over time. Sensitive data — encrypted at rest.",
    retention_days: -1,
    sensitive: true,
  },
  COMPANION_ENCRYPTED: {
    id: "companion_encrypted",
    version: 1,
    optional: true,
    legal_basis_in: "explicit_consent",
    legal_basis_eu: "art_9_2_a_explicit_consent",
    description:
      "Save Sahay companion conversations encrypted at rest (server-side AES-GCM with KMS-wrapped key, OR zero-knowledge vault if you set a passphrase).",
    retention_days: 30,
    sensitive: true,
    user_can_extend_ttl: true,
  },
  RESEARCH_AGGREGATE: {
    id: "research_aggregate",
    version: 1,
    optional: true,
    legal_basis_in: "consent",
    legal_basis_eu: "art_6_1_a_consent",
    description:
      "Anonymous, aggregate analytics on which resources help readers most. No content of your messages or assessments is included.",
    retention_days: 730,
  },
  CONTENT_PUBLISHING: {
    id: "content_publishing",
    version: 1,
    optional: false,
    legal_basis_in: "necessary_for_specified_purpose",
    legal_basis_eu: "art_6_1_f_legitimate_interest",
    description:
      "Publish curated articles, videos, and short-form clips to our own catalog (server-side process, no user data involved).",
    retention_days: -1,
  },
} as const;

export type PurposeId = keyof typeof PURPOSES extends infer K
  ? K extends keyof typeof PURPOSES
    ? (typeof PURPOSES)[K]["id"]
    : never
  : never;

export type Purpose = (typeof PURPOSES)[keyof typeof PURPOSES];

export const ALL_PURPOSES = Object.values(PURPOSES) as ReadonlyArray<Purpose>;

export const OPTIONAL_PURPOSES = ALL_PURPOSES.filter((p) => p.optional);

export const SENSITIVE_PURPOSES = ALL_PURPOSES.filter(
  (p): p is Purpose & { sensitive: true } => "sensitive" in p && p.sensitive === true,
);

/**
 * Data-principal rights endpoints required by DPDP Section 11 / GDPR Arts. 15-21.
 * Each right maps to a route in app/api/me/*.
 */
export const DATA_PRINCIPAL_RIGHTS = {
  access: "/api/me/export",
  correction: "/api/me/correct",
  erasure: "/api/me/delete",
  portability: "/api/me/export?format=json",
  withdraw_consent: "/api/me/consent",
  grievance: "/api/me/grievance",
} as const;
