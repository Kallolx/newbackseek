-- Storage reporting: the camera file size before the browser shrank it, and when
-- the worker finished processing each picture.
ALTER TABLE media ADD COLUMN IF NOT EXISTS original_bytes bigint CHECK (original_bytes IS NULL OR original_bytes > 0);
ALTER TABLE media ADD COLUMN IF NOT EXISTS processed_at timestamptz;
CREATE INDEX IF NOT EXISTS media_created_idx ON media (created_at DESC);
