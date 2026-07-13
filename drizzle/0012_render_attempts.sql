-- Render-attempt accounting for content_drafts, used to back off the hourly
-- render-due cron so a draft whose render keeps failing (e.g. the Vercel Blob
-- store is full/suspended) is retried on an exponential schedule instead of
-- every single hour. This stops the failing-render loop from re-pulling
-- voiceover/portrait assets out of Blob 24x/day and draining the free-tier
-- data-transfer quota.
--
-- We deliberately use a TIME-BASED BACKOFF rather than a permanent cap: a
-- draft that has exhausted its attempts still becomes eligible again after the
-- max backoff window, so once the underlying issue is fixed the draft heals
-- itself without any manual intervention.
--
-- Both columns are nullable / defaulted so existing rows and existing code
-- paths are unaffected. Idempotent.

ALTER TABLE content_drafts
  ADD COLUMN IF NOT EXISTS render_attempts integer NOT NULL DEFAULT 0;

ALTER TABLE content_drafts
  ADD COLUMN IF NOT EXISTS last_render_attempt_at timestamptz;
