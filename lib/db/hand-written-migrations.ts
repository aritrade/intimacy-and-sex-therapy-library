/**
 * Canonical, ordered list of hand-written SQL migrations that drizzle-kit
 * doesn't model well (extensions, pgvector indexes, idempotent ALTERs).
 *
 * SINGLE SOURCE OF TRUTH — imported by both the production migrator
 * (lib/db/migrate.ts) and the integration-test DB bootstrap
 * (tests/integration/_db.ts). Keeping one list means a fresh test database
 * can never drift from production (the drift that previously made CI red:
 * the test helper applied only 0001 + 0002 and so lacked, e.g., the
 * content_drafts.grounding column).
 *
 * Every file MUST be idempotent (IF NOT EXISTS / OR REPLACE) so applying the
 * full list on an already-migrated database is a no-op.
 */
export const HAND_WRITTEN_MIGRATIONS: ReadonlyArray<readonly [label: string, file: string]> = [
  ["pgvector + GIN indexes", "0001_indexes.sql"],
  ["reviewer-notes column (Phase 13)", "0002_reviewer_notes.sql"],
  ["embeddings -> Gemini 768-dim", "0005_vector_768.sql"],
  ["content_drafts.grounding column", "0006_grounding.sql"],
  ["content_drafts.archived_at column", "0007_archive_drafts.sql"],
  ["email_subscribers table", "0008_email_subscribers.sql"],
  ["page_views table", "0009_page_views.sql"],
  ["help search cache + flags", "0010_help_search.sql"],
  ["widen assessment_results.severity", "0011_assessment_severity_widen.sql"],
] as const;
