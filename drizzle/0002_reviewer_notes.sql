-- Phase 13: append-only structured feedback on content drafts.
-- Each entry: { reason, notes, by, role, ts } (notes are scrubbed before insertion).

ALTER TABLE content_drafts
  ADD COLUMN IF NOT EXISTS reviewer_notes jsonb DEFAULT '[]'::jsonb;

-- Backfill any pre-existing rows so we never see NULL on read.
UPDATE content_drafts SET reviewer_notes = '[]'::jsonb WHERE reviewer_notes IS NULL;
