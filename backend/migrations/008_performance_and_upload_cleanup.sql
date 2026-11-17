-- Speed up the hottest read paths and support upload-on-select.

-- Every authenticated request reads the member's latest verification status.
CREATE INDEX IF NOT EXISTS verifications_user_latest_idx ON verifications(user_id, created_at DESC);

-- Feed, detail and account pages read an ad's ready pictures in upload order.
CREATE INDEX IF NOT EXISTS media_ad_ready_order_idx ON media(ad_id, created_at, id) WHERE status = 'ready' AND purpose = 'ad';

-- Edit/attach paths count and lock pictures for an ad regardless of status.
CREATE INDEX IF NOT EXISTS media_ad_any_idx ON media(ad_id) WHERE ad_id IS NOT NULL;

-- Pictures now upload as soon as they are chosen. Pictures from abandoned forms
-- were never attached to an ad; only those are cleaned up automatically.
-- Everything that already exists is marked as attached so it is never swept.
ALTER TABLE media ADD COLUMN IF NOT EXISTS ever_attached boolean NOT NULL DEFAULT false;
UPDATE media SET ever_attached = true WHERE NOT ever_attached;
CREATE INDEX IF NOT EXISTS media_unattached_idx ON media(created_at) WHERE ad_id IS NULL AND NOT ever_attached AND purpose = 'ad';

-- Feed lookups by city + category + status.
CREATE INDEX IF NOT EXISTS ads_category_status_idx ON ads(category_slug, status);
