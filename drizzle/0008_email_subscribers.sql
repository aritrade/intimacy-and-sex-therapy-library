-- Owned newsletter list (replaces Buttondown). Double opt-in: rows start
-- 'pending' and become 'confirmed' only after the subscriber clicks the
-- confirmation link. We store the email here (the source of truth) plus
-- opaque tokens for confirm/unsubscribe links. Idempotent.

CREATE TABLE IF NOT EXISTS email_subscribers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         varchar(320) NOT NULL UNIQUE,
  status        varchar(16) NOT NULL DEFAULT 'pending',
  confirm_token varchar(64) NOT NULL,
  unsub_token   varchar(64) NOT NULL,
  locale        varchar(8),
  tags          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  confirmed_at  timestamptz,
  unsubscribed_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_subscribers_status_idx
  ON email_subscribers (status);
CREATE INDEX IF NOT EXISTS email_subscribers_confirm_token_idx
  ON email_subscribers (confirm_token);
CREATE INDEX IF NOT EXISTS email_subscribers_unsub_token_idx
  ON email_subscribers (unsub_token);
