-- Soft-archive flag for posted/taken-down drafts. We do NOT change status (the
-- metrics poller reads status in ('posted','taken_down')), we only stamp
-- archived_at so the admin list can hide long-settled drafts. Idempotent.

ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS content_drafts_archived_at_idx
  ON content_drafts (archived_at);
