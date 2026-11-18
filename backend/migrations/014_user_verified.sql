-- Admin-set "Verified" badge on a member (in addition to an approved verification request).
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at timestamptz;
