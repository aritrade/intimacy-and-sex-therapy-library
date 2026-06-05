-- In-app web traffic log. Privacy-first: NO IP address and NO user identifier
-- are stored. Geo fields come from Vercel's edge headers (country/region/city
-- granularity only). One sampled row per page view. Idempotent.

CREATE TABLE IF NOT EXISTS page_views (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ts            timestamptz NOT NULL DEFAULT now(),
  path          text NOT NULL,
  referrer_host text,
  country       varchar(2),
  region        varchar(8),
  city          text,
  device_type   varchar(12),
  is_bot        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS page_views_ts_idx ON page_views (ts);
CREATE INDEX IF NOT EXISTS page_views_country_idx ON page_views (country);
CREATE INDEX IF NOT EXISTS page_views_path_idx ON page_views (path);
