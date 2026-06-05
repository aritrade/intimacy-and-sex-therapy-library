-- Find Help hub: cache for aggregated (Google Places + web-search) clinician /
-- community results, plus user-submitted flags for moderation.
--
-- Privacy-first: the cache is keyed by a hash of the NORMALIZED query only
-- (country/state/locality/specialty/topic/scope) — never a user identifier.
-- Results are public-listing metadata fetched from official APIs. Idempotent.

CREATE TABLE IF NOT EXISTS help_search_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text NOT NULL UNIQUE,
  kind       varchar(16) NOT NULL,                 -- 'clinicians' | 'communities'
  query      jsonb NOT NULL,
  results    jsonb NOT NULL DEFAULT '[]'::jsonb,
  source     varchar(32) NOT NULL DEFAULT 'mixed', -- places | web | mixed | none
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS help_cache_kind_idx ON help_search_cache (kind);
CREATE INDEX IF NOT EXISTS help_cache_expires_idx ON help_search_cache (expires_at);

CREATE TABLE IF NOT EXISTS help_result_flags (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text,
  result_ref text NOT NULL,        -- stable id of a result (place_id or hashed url)
  reason     varchar(48),
  hidden     boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS help_flags_ref_idx ON help_result_flags (result_ref);
CREATE INDEX IF NOT EXISTS help_flags_hidden_idx ON help_result_flags (hidden);
