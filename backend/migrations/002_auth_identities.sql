ALTER TABLE users ADD COLUMN IF NOT EXISTS google_subject text UNIQUE;

CREATE TABLE IF NOT EXISTS email_verifications (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_idx ON email_verifications(user_id);
