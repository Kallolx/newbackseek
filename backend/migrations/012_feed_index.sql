-- Fast public feeds: "city + category, newest first, published only" is answered
-- straight from one index instead of reading every ad in the city.
-- Placements carry a copy of the ad's category and published state; triggers keep
-- the copy exact whenever an ad changes or a placement is added.
ALTER TABLE placements ADD COLUMN IF NOT EXISTS category_slug text;
ALTER TABLE placements ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;

UPDATE placements p SET category_slug = a.category_slug, published = (a.status = 'published')
FROM ads a WHERE a.id = p.ad_id;

CREATE OR REPLACE FUNCTION bpn_placement_fill() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT a.category_slug, a.status = 'published' INTO NEW.category_slug, NEW.published FROM ads a WHERE a.id = NEW.ad_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS placements_fill ON placements;
CREATE TRIGGER placements_fill BEFORE INSERT OR UPDATE OF ad_id ON placements
FOR EACH ROW EXECUTE FUNCTION bpn_placement_fill();

CREATE OR REPLACE FUNCTION bpn_ad_sync_placements() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.category_slug IS DISTINCT FROM OLD.category_slug OR NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE placements SET category_slug = NEW.category_slug, published = (NEW.status = 'published') WHERE ad_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ads_sync_placements ON ads;
CREATE TRIGGER ads_sync_placements AFTER UPDATE OF category_slug, status ON ads
FOR EACH ROW EXECUTE FUNCTION bpn_ad_sync_placements();

CREATE INDEX IF NOT EXISTS placements_public_feed_idx
  ON placements (city_id, category_slug, ranked_at DESC, ad_id DESC) WHERE published;

ANALYZE placements;
