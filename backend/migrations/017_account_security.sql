-- Member account security: two-step verification (authenticator app), device list, password state, contact messages.
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending_secret text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_counter bigint;
ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes text[] NOT NULL DEFAULT '{}';
-- false for accounts made with Google that never chose a password (they set one without the "current password").
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_set boolean NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;
UPDATE users SET password_set = false WHERE google_subject IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM audit_events e WHERE e.actor_id = users.id AND e.action IN ('account.password'));
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS country text;
CREATE TABLE IF NOT EXISTS contact_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL, email text NOT NULL, topic text NOT NULL, message text NOT NULL,
  user_id uuid REFERENCES users(id), ip text, status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
