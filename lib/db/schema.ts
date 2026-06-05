import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * pgvector custom type. Pinned to 768 to match Gemini `gemini-embedding-001`
 * with outputDimensionality=768 (see lib/ai/embeddings.ts). Migrated from the
 * original OpenAI 1536 dims in drizzle/0005_vector_768.sql.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// ---------------------------------------------------------------------------
// Source allowlist + content corpus
// ---------------------------------------------------------------------------

export const sourceKind = pgEnum("source_kind", [
  "journal",
  "clinical_body",
  "university",
  "health_authority",
  "publisher",
  "video_channel",
  "podcast",
  "ngo",
  "government",
]);

export const trustTier = pgEnum("trust_tier", ["tier_1", "tier_2", "tier_3"]);

export const sources = pgTable("sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 96 }).notNull().unique(),
  name: text("name").notNull(),
  kind: sourceKind("kind").notNull(),
  url: text("url").notNull(),
  trustTier: trustTier("trust_tier").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resourceKind = pgEnum("resource_kind", [
  "article",
  "video",
  "podcast_episode",
  "book",
  "guideline",
  "worksheet",
]);

export const license = pgEnum("license", [
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "cc_by_nc_sa",
  "cc_by_nc_nd",
  "cc0",
  "public_domain",
  "govt_work",
  "oa_pmc",
  "copyrighted",
  "original",
]);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 200 }).notNull().unique(),
    sourceId: uuid("source_id")
      .references(() => sources.id, { onDelete: "restrict" })
      .notNull(),
    kind: resourceKind("kind").notNull(),
    title: text("title").notNull(),
    authors: jsonb("authors").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    authorCredentials: jsonb("author_credentials")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    language: varchar("language", { length: 12 }).notNull().default("en"),
    license: license("license").notNull(),
    fullTextAvailable: boolean("full_text_available").notNull().default(false),
    externalUrl: text("external_url").notNull(),
    pdfBlobUrl: text("pdf_blob_url"),
    summary: text("summary"),
    curatorNotes: text("curator_notes"),
    isPublished: boolean("is_published").notNull().default(false),
    /**
     * When true, the freshness agent skips this resource entirely — it
     * won't emit `needs_refresh` proposals regardless of how old the
     * publication date is. Use for genuinely evergreen reference works
     * (foundational textbooks, AASECT position papers that haven't been
     * superseded, etc.). Defaulting to false keeps the existing
     * behaviour for everything else.
     */
    isEvergreen: boolean("is_evergreen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySource: index("resources_source_idx").on(t.sourceId),
    byKind: index("resources_kind_idx").on(t.kind),
    byPublished: index("resources_published_idx").on(t.isPublished),
  }),
);

export const tagCategory = pgEnum("tag_category", [
  "topic",
  "difficulty",
  "population",
  "modality",
]);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 96 }).notNull(),
    category: tagCategory("category").notNull(),
    description: text("description"),
  },
  (t) => ({
    uniqName: index("tags_name_category_idx").on(t.category, t.name),
  }),
);

export const resourceTags = pgTable(
  "resource_tags",
  {
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    tagId: uuid("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.resourceId, t.tagId] }),
    byTag: index("resource_tags_tag_idx").on(t.tagId),
  }),
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    ord: integer("ord").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens").notNull(),
    pageNum: integer("page_num"),
    timestampSeconds: integer("timestamp_seconds"),
    tsv: tsvector("tsv"),
    embedding: vector("embedding"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byResource: index("chunks_resource_idx").on(t.resourceId),
    // Note: HNSW + GIN indexes are emitted in a hand-written migration in
    // drizzle/0001_indexes.sql since drizzle-kit doesn't yet model them well.
  }),
);

export const variantType = pgEnum("variant_type", [
  "plain_language",
  "audio_tts",
  "translated_hi",
  "translated_hinglish",
  "translated_ta",
  "translated_bn",
]);

export const resourceVariants = pgTable("resource_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  resourceId: uuid("resource_id")
    .references(() => resources.id, { onDelete: "cascade" })
    .notNull(),
  variantType: variantType("variant_type").notNull(),
  content: text("content").notNull(),
  audioBlobUrl: text("audio_blob_url"),
  reviewerId: uuid("reviewer_id"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Clinical advisors + reviews
// ---------------------------------------------------------------------------

export const clinicalAdvisors = pgTable("clinical_advisors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  credentials: jsonb("credentials").$type<string[]>().notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    reviewerId: uuid("reviewer_id")
      .references(() => clinicalAdvisors.id)
      .notNull(),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).defaultNow().notNull(),
    nextReviewDue: timestamp("next_review_due", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byResource: index("reviews_resource_idx").on(t.resourceId),
    byDue: index("reviews_due_idx").on(t.nextReviewDue),
  }),
);

// ---------------------------------------------------------------------------
// Clinician handoff directory (India-first)
// ---------------------------------------------------------------------------

export const affordabilityTier = pgEnum("affordability_tier", [
  "free",
  "low",
  "mid",
  "high",
]);

export const clinicianDirectory = pgTable(
  "clinician_directory",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    credentials: jsonb("credentials").$type<string[]>().notNull(),
    city: varchar("city", { length: 96 }),
    country: varchar("country", { length: 4 }).notNull(),
    languages: jsonb("languages").$type<string[]>().notNull(),
    modalities: jsonb("modalities").$type<string[]>().notNull(),
    teleConsult: boolean("tele_consult").notNull().default(false),
    affordability: affordabilityTier("affordability").notNull().default("mid"),
    contactUrl: text("contact_url"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCountry: index("clinicians_country_idx").on(t.country),
    byCity: index("clinicians_city_idx").on(t.city),
  }),
);

// ---------------------------------------------------------------------------
// Validated assessments (FSFI, IIEF-5, GRISS, FSDS-R, NSSS, PHQ-9, GAD-7)
// Responses are encrypted; this is sensitive personal data under DPDP.
// ---------------------------------------------------------------------------

export const instrument = pgEnum("instrument", [
  "fsfi",
  "iief5",
  "griss",
  "fsds_r",
  "nsss",
  "phq9",
  "gad7",
]);

export const assessments = pgTable("assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"), // nullable for anon
  instrument: instrument("instrument").notNull(),
  responsesCiphertext: text("responses_ciphertext").notNull(),
  responsesIv: text("responses_iv").notNull(),
  responsesAuthTag: text("responses_auth_tag").notNull(),
  score: integer("score").notNull(),
  interpretationKey: varchar("interpretation_key", { length: 64 }).notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Learning paths
// ---------------------------------------------------------------------------

export const pathItemKind = pgEnum("path_item_kind", [
  "read",
  "watch",
  "listen",
  "reflect",
  "worksheet",
  "assessment",
]);

export const learningPaths = pgTable("learning_paths", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  targetAudience: text("target_audience"),
  estMinutes: integer("est_minutes").notNull().default(60),
  language: varchar("language", { length: 12 }).notNull().default("en"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const pathItems = pgTable(
  "path_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pathId: uuid("path_id")
      .references(() => learningPaths.id, { onDelete: "cascade" })
      .notNull(),
    ord: integer("ord").notNull(),
    resourceId: uuid("resource_id").references(() => resources.id, {
      onDelete: "restrict",
    }),
    kind: pathItemKind("kind").notNull(),
    optional: boolean("optional").notNull().default(false),
    note: text("note"),
  },
  (t) => ({
    byPath: index("path_items_path_idx").on(t.pathId, t.ord),
  }),
);

// ---------------------------------------------------------------------------
// Per-user state (bookmarks, progress, private notes)
// ---------------------------------------------------------------------------

export const bookmarks = pgTable(
  "bookmarks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("bookmarks_user_idx").on(t.userId),
  }),
);

export const pathProgress = pgTable(
  "path_progress",
  {
    userId: uuid("user_id").notNull(),
    pathId: uuid("path_id")
      .references(() => learningPaths.id, { onDelete: "cascade" })
      .notNull(),
    completedItems: jsonb("completed_items").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.pathId] }),
  }),
);

export const privateNotes = pgTable(
  "private_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    resourceId: uuid("resource_id")
      .references(() => resources.id, { onDelete: "cascade" })
      .notNull(),
    bodyCiphertext: text("body_ciphertext").notNull(),
    bodyIv: text("body_iv").notNull(),
    bodyAuthTag: text("body_auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUserResource: index("private_notes_user_resource_idx").on(t.userId, t.resourceId),
  }),
);

export const coupleLinks = pgTable("couple_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  partnerAUserId: uuid("partner_a_user_id").notNull(),
  partnerBUserId: uuid("partner_b_user_id").notNull(),
  consentedAtA: timestamp("consented_at_a", { withTimezone: true }),
  consentedAtB: timestamp("consented_at_b", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Citation-mode chat (/chat) sessions and feedback
// ---------------------------------------------------------------------------

export const chatSessions = pgTable("chat_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id"),
  scopedResourceId: uuid("scoped_resource_id").references(() => resources.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .references(() => chatSessions.id, { onDelete: "cascade" })
    .notNull(),
  role: varchar("role", { length: 16 }).notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<{ resourceId: string; chunkId: string }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Sahay companion sessions — encrypted ciphertext only.
// Plaintext NEVER touches a column in this table.
// ---------------------------------------------------------------------------

export const companionMode = pgEnum("companion_mode", [
  "ephemeral",
  "encrypted",
  "vault",
]);

export const pace = pgEnum("pace", ["slow", "normal"]);
export const directness = pgEnum("directness", ["gentle", "matter_of_fact"]);

export const companionSessions = pgTable(
  "companion_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id"), // nullable for anon
    mode: companionMode("mode").notNull(),
    dekWrapped: text("dek_wrapped"), // base64; null for ephemeral
    kmsKeyId: text("kms_key_id"),
    language: varchar("language", { length: 12 }).notNull().default("en"),
    pronouns: varchar("pronouns", { length: 48 }),
    pace: pace("pace").notNull().default("normal"),
    directness: directness("directness").notNull().default("gentle"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => ({
    byUser: index("companion_sessions_user_idx").on(t.userId),
    byExpires: index("companion_sessions_expires_idx").on(t.expiresAt),
  }),
);

export const companionMessages = pgTable(
  "companion_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .references(() => companionSessions.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 16 }).notNull(),
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    bySession: index("companion_messages_session_idx").on(t.sessionId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Consents (DPDP/GDPR audit trail). Cookie is the live state; this table
// is the durable, server-side audit record.
// ---------------------------------------------------------------------------

export const consents = pgTable(
  "consents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id"),
    sessionFingerprint: varchar("session_fingerprint", { length: 64 }), // hashed cookie id, not PII
    purpose: varchar("purpose", { length: 64 }).notNull(),
    purposeVersion: integer("purpose_version").notNull(),
    granted: boolean("granted").notNull(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    legalBasisIn: varchar("legal_basis_in", { length: 64 }).notNull(),
    legalBasisEu: varchar("legal_basis_eu", { length: 64 }).notNull(),
  },
  (t) => ({
    byUser: index("consents_user_idx").on(t.userId),
  }),
);

// ---------------------------------------------------------------------------
// Crisis events + content-free audit log + eval runs
// ---------------------------------------------------------------------------

export const crisisEvents = pgTable("crisis_events", {
  id: bigint("id", { mode: "bigint" }).generatedAlwaysAsIdentity().primaryKey(),
  sessionFingerprint: varchar("session_fingerprint", { length: 64 }).notNull(),
  surface: varchar("surface", { length: 16 }).notNull(), // chat | companion
  category: varchar("category", { length: 32 }).notNull(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "bigint" }).generatedAlwaysAsIdentity().primaryKey(),
  actorHash: varchar("actor_hash", { length: 64 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  meta: jsonb("meta"),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
});

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  modelId: varchar("model_id", { length: 64 }).notNull(),
  promptSetVersion: varchar("prompt_set_version", { length: 32 }).notNull(),
  refusalRate: integer("refusal_rate_bp").notNull(), // basis points (0-10000)
  citationFaithfulness: integer("citation_faithfulness_bp").notNull(),
  empathyScore: integer("empathy_score_x100").notNull(), // 0-500 -> 0.00-5.00
  biasFlags: jsonb("bias_flags"),
  ranAt: timestamp("ran_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Phase 6: short-form content factory + social publishing
// ---------------------------------------------------------------------------

export const draftStatus = pgEnum("draft_status", [
  "script_draft",
  "clinician_reviewed",
  "rendered",
  "editor_reviewed",
  "scheduled",
  "posted",
  "failed",
  "taken_down",
]);

export const contentDrafts = pgTable("content_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  resourceId: uuid("resource_id")
    .references(() => resources.id, { onDelete: "set null" }),
  kind: varchar("kind", { length: 16 }).notNull(), // reel | short | feed
  language: varchar("language", { length: 12 }).notNull().default("en"),
  brief: text("brief").notNull(),
  scriptMd: text("script_md"),
  voiceoverUrl: text("voiceover_url"),
  videoUrl: text("video_url"),
  captionsSrt: text("captions_srt"),
  status: draftStatus("status").notNull().default("script_draft"),
  clinicianReviewerId: uuid("clinician_reviewer_id").references(() => clinicalAdvisors.id),
  editorReviewerId: uuid("editor_reviewer_id"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  platformPostIds: jsonb("platform_post_ids"),
  takedownEvents: jsonb("takedown_events").$type<unknown[]>().default(sql`'[]'::jsonb`),
  /**
   * Append-only structured feedback from clinician / editor reviewers.
   * Each entry: { reason, notes, by (hashed actor), role, ts }.
   * Notes are scrubbed by lib/observability/scrub.ts before insertion.
   */
  reviewerNotes: jsonb("reviewer_notes")
    .$type<
      Array<{
        reason: string;
        notes?: string;
        by: string;
        role: "clinician" | "editor" | "admin";
        ts: string;
      }>
    >()
    .default(sql`'[]'::jsonb`),
  /**
   * RAG grounding metadata captured at generation time. Null when the draft
   * predates grounding. `lowGrounding=true` means generation fell back to the
   * ungrounded path (no evidence retrieved) and needs closer clinician review.
   */
  grounding: jsonb("grounding").$type<{
    chunkIds: string[];
    sources: Array<{ title: string; url: string; year: number | null }>;
    score: number;
    lowGrounding: boolean;
  } | null>(),
  /**
   * Soft-archive stamp for settled posted/taken-down drafts. Status is left
   * unchanged so the metrics poller keeps working; the admin list just hides
   * archived rows by default.
   */
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const socialAccounts = pgTable("social_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  platform: varchar("platform", { length: 16 }).notNull(), // instagram | youtube
  handle: varchar("handle", { length: 64 }).notNull(),
  accountId: varchar("account_id", { length: 96 }).notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  scopes: jsonb("scopes").$type<string[]>().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const postMetrics = pgTable("post_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .references(() => contentDrafts.id, { onDelete: "cascade" })
    .notNull(),
  platform: varchar("platform", { length: 16 }).notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  linkClicks: integer("link_clicks").notNull().default(0),
  pulledAt: timestamp("pulled_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Auth.js (NextAuth v5) tables — Drizzle adapter shape.
// Names mirror the Auth.js docs so the adapter recognises them.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  emailVerified: timestamp("emailVerified", { withTimezone: true }),
  image: text("image"),
  // Region helps Sahay/Companion produce locale-aware crisis lines and pricing.
  // Optional — only set if the user opts in.
  region: varchar("region", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 32 }).notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerAccountId: varchar("providerAccountId", { length: 128 }).notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: varchar("token_type", { length: 32 }),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: varchar("sessionToken", { length: 256 }).primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationTokens",
  {
    identifier: varchar("identifier", { length: 320 }).notNull(),
    token: varchar("token", { length: 256 }).notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", [
  "user",
  "viewer",
  "clinician",
  "editor",
  "admin",
]);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: userRole("role").notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.role] }),
  }),
);

// ---------------------------------------------------------------------------
// Per-user persisted state.
//
// Compliance note: assessment results store only score/severity/flags — never
// the user's individual answers. Crisis flags are kept so we can show the user
// "you flagged item 9 of PHQ-9 last time" without storing the answer.
// ---------------------------------------------------------------------------

export const assessmentResults = pgTable(
  "assessment_results",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    instrumentId: varchar("instrument_id", { length: 64 }).notNull(), // e.g. phq9, gad7, nsss-s
    rawScore: integer("raw_score").notNull(),
    severity: varchar("severity", { length: 32 }).notNull(),
    flags: jsonb("flags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("assessment_results_user_idx").on(t.userId, t.takenAt),
  }),
);

/**
 * Per-user progress on the file-defined seeded paths in lib/paths/seeds.ts.
 * Distinct from the older `path_progress` table (which tracks DB-stored
 * `learning_paths` rows by UUID + completedItems JSON). The seeded paths are
 * versioned in code, so we key by slug + stepIndex and rely on the file as
 * the source of truth for step content.
 */
export const userPathProgress = pgTable(
  "user_path_progress",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pathSlug: varchar("path_slug", { length: 64 }).notNull(),
    stepIndex: integer("step_index").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.pathSlug, t.stepIndex] }),
  }),
);

// ---------------------------------------------------------------------------
// Vault entries (Sahay zero-knowledge mode).
//
// We store ciphertext + iv + salt + a label. The decryption key never leaves
// the user's device (PBKDF2-derived from a passphrase). The server cannot read
// these blobs and is not expected to. We keep them indexed by user so the
// "Forget me" flow can hard-delete them.
// ---------------------------------------------------------------------------

export const vaultEntries = pgTable(
  "vault_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 80 }).notNull(),
    ciphertext: text("ciphertext").notNull(), // base64
    iv: text("iv").notNull(), // base64
    salt: text("salt").notNull(), // base64
    kdfIterations: integer("kdf_iterations").notNull().default(310_000),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byUser: index("vault_entries_user_idx").on(t.userId, t.createdAt),
  }),
);

// ---------------------------------------------------------------------------
// Daily content-sync agent: structured proposals.
//
// The agent (see /lib/sync/*.ts) runs at 03:00 IST and emits proposals
// instead of mutating the catalog directly. A human approves or rejects
// each one from /admin/proposals. Approved proposals are applied with
// the same validation the rest of the catalog uses.
//
// `kind` discriminates the payload shape. Today:
//   - "fix_url"          {resourceId, oldUrl, newUrl, evidence}
//   - "needs_refresh"    {resourceId, reason: "stale" | "metadata_drift", details}
//   - "new_resource"     {sourceSlug, externalUrl, title, kind, license, ...}
//   - "remove_resource"  {resourceId, reason: "unreachable" | "deprecated" | "delisted"}
//   - "metadata_drift"   {resourceId, field, current, suggested}
// ---------------------------------------------------------------------------

export const proposalStatus = pgEnum("proposal_status", [
  "open",
  "approved",
  "rejected",
  "applied",
  "errored",
]);

export const proposalKind = pgEnum("proposal_kind", [
  "fix_url",
  "needs_refresh",
  "new_resource",
  "remove_resource",
  "metadata_drift",
]);

export const resourceProposals = pgTable(
  "resource_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: proposalKind("kind").notNull(),
    /** Hashed agent identifier — e.g. "agent:link-health". */
    proposedBy: varchar("proposed_by", { length: 96 }).notNull(),
    resourceId: uuid("resource_id").references(() => resources.id, { onDelete: "set null" }),
    /** Free-form structured payload; shape depends on kind. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** One-line summary surfaced in the admin list. */
    summary: text("summary").notNull(),
    /** Why the agent thinks this proposal is correct. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    /** 0–1 confidence score the agent assigns. Used for sorting. */
    confidence: integer("confidence").notNull().default(50),
    status: proposalStatus("status").notNull().default("open"),
    /** Hashed actor that approved/rejected. */
    decidedBy: varchar("decided_by", { length: 96 }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** Optional reviewer note (scrubbed before insertion). */
    decisionNotes: text("decision_notes"),
    /** Result of the apply step (URL of new resource, error message, etc.). */
    appliedResult: jsonb("applied_result").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byStatus: index("resource_proposals_status_idx").on(t.status, t.createdAt),
    byKind: index("resource_proposals_kind_idx").on(t.kind, t.status),
    byResource: index("resource_proposals_resource_idx").on(t.resourceId),
  }),
);

// ---------------------------------------------------------------------------
// User feedback (public homepage form)
//
// Unlike the email subscribe flow — which keeps PII out of our DB and only
// stores a hashed fingerprint in audit_log — this table DOES store the
// submitter's email + message in plaintext. The user explicitly opted in
// by submitting; the privacy notice on the form makes this clear. We hash
// the IP for rate-limit + abuse-detection without persisting raw IP.
// ---------------------------------------------------------------------------

export const feedbackCategory = pgEnum("feedback_category", [
  "improvement",
  "praise",
  "bug",
  "other",
]);

export const userFeedback = pgTable(
  "user_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Submitter email. Required because the user asked to be contactable. */
    email: varchar("email", { length: 320 }).notNull(),
    message: text("message").notNull(),
    category: feedbackCategory("category").notNull().default("other"),
    /** BCP-47 tag captured from the form so we can chart per-locale signal. */
    locale: varchar("locale", { length: 8 }),
    /** sha256 of IP + a server-side pepper, truncated. Used for rate limit. */
    ipHash: varchar("ip_hash", { length: 32 }),
    /** Optional: source page (homepage, library, etc.) for funnel context. */
    sourcePath: varchar("source_path", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byCreatedAt: index("user_feedback_created_at_idx").on(t.createdAt),
    byCategory: index("user_feedback_category_idx").on(t.category, t.createdAt),
    byEmail: index("user_feedback_email_idx").on(t.email),
  }),
);

// ---------------------------------------------------------------------------
// Channel-level metrics (subscriber/follower counts per platform per day)
//
// post_metrics tracks per-post engagement; channel_metrics tracks the
// account-wide counter (subscriber count, follower count, page like count).
// One row per platform per day = trivially queryable for a "subs over time"
// line chart. The metrics poller writes one row per platform per run; the
// admin/analytics dashboard reads the most recent + a 90-day window.
// ---------------------------------------------------------------------------

export const channelMetrics = pgTable(
  "channel_metrics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    platform: varchar("platform", { length: 16 }).notNull(), // youtube | instagram | facebook
    /** Public account id (channel id / IG user id / FB page id). */
    accountId: varchar("account_id", { length: 96 }).notNull(),
    /** Friendly handle for display only. */
    handle: varchar("handle", { length: 64 }),
    /** Subscriber / follower / page-like count. Whichever the platform exposes. */
    followers: integer("followers").notNull().default(0),
    /** Total uploads / posts (where available). */
    posts: integer("posts").notNull().default(0),
    /** Lifetime views (YouTube exposes this; IG/FB do not). 0 when unknown. */
    totalViews: bigint("total_views", { mode: "number" }).notNull().default(0),
    /** Raw response stashed for forensics; empty object when caller didn't pass one. */
    raw: jsonb("raw").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    pulledAt: timestamp("pulled_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byPlatformAndTime: index("channel_metrics_platform_time_idx").on(
      t.platform,
      t.pulledAt,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Owned newsletter list (replaces Buttondown). Double opt-in: a row is created
// 'pending' on signup and flips to 'confirmed' only after the subscriber
// clicks the confirmation link. The email lives here (source of truth);
// confirm/unsub tokens back the one-click links.
// ---------------------------------------------------------------------------

export const emailSubscribers = pgTable(
  "email_subscribers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull().unique(),
    status: varchar("status", { length: 16 }).notNull().default("pending"), // pending | confirmed | unsubscribed
    confirmToken: varchar("confirm_token", { length: 64 }).notNull(),
    unsubToken: varchar("unsub_token", { length: 64 }).notNull(),
    locale: varchar("locale", { length: 8 }),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => ({
    byStatus: index("email_subscribers_status_idx").on(t.status),
    byConfirmToken: index("email_subscribers_confirm_token_idx").on(t.confirmToken),
    byUnsubToken: index("email_subscribers_unsub_token_idx").on(t.unsubToken),
  }),
);

// ---------------------------------------------------------------------------
// In-app web traffic log. Privacy-first: no IP, no user id. Geo granularity is
// country/region/city from Vercel edge headers. One sampled row per page view;
// the admin analytics page aggregates country / top pages / referrers.
// ---------------------------------------------------------------------------

export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
    path: text("path").notNull(),
    referrerHost: text("referrer_host"),
    country: varchar("country", { length: 2 }),
    region: varchar("region", { length: 8 }),
    city: text("city"),
    deviceType: varchar("device_type", { length: 12 }),
    isBot: boolean("is_bot").notNull().default(false),
  },
  (t) => ({
    byTs: index("page_views_ts_idx").on(t.ts),
    byCountry: index("page_views_country_idx").on(t.country),
    byPath: index("page_views_path_idx").on(t.path),
  }),
);

// ---------------------------------------------------------------------------
// Find Help hub: aggregated search cache + moderation flags
// ---------------------------------------------------------------------------

/**
 * Cache for aggregated (Google Places + web-search) clinician / community
 * results. Keyed by a hash of the normalized query (no user identifiers). Rows
 * are served while `expires_at` is in the future, then refreshed on demand.
 */
export const helpSearchCache = pgTable(
  "help_search_cache",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cacheKey: text("cache_key").notNull().unique(),
    kind: varchar("kind", { length: 16 }).notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull(),
    results: jsonb("results").$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    source: varchar("source", { length: 32 }).notNull().default("mixed"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byKind: index("help_cache_kind_idx").on(t.kind),
    byExpires: index("help_cache_expires_idx").on(t.expiresAt),
  }),
);

/**
 * User-submitted "Report" on an aggregated result. An admin can set
 * `hidden=true` to suppress a result globally (consistent with the
 * curator-reviewed ethos). `result_ref` is a stable id (place_id or hashed url).
 */
export const helpResultFlags = pgTable(
  "help_result_flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cacheKey: text("cache_key"),
    resultRef: text("result_ref").notNull(),
    reason: varchar("reason", { length: 48 }),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    byRef: index("help_flags_ref_idx").on(t.resultRef),
    byHidden: index("help_flags_hidden_idx").on(t.hidden),
  }),
);
