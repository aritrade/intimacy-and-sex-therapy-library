-- RAG grounding metadata per draft: which chunks/sources were retrieved, the
-- aggregate grounding score, and whether the draft fell back to ungrounded
-- generation (low-grounding) so clinicians can prioritise faithfulness review.
-- Idempotent.

ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS grounding jsonb;
