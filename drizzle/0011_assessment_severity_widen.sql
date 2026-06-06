-- Widen assessment_results.severity so longer band labels fit (e.g. the ASEX
-- label "No clear indication of difficulty" is 33 chars and previously failed
-- to persist against the varchar(32) column). Idempotent.
ALTER TABLE assessment_results ALTER COLUMN severity TYPE varchar(64);
