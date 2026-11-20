-- Official X (Twitter) profile: used in structured data (sameAs) and share cards.
UPDATE seo_settings SET data = data
  || jsonb_build_object('organization', coalesce(data->'organization', '{}'::jsonb)
       || jsonb_build_object('sameAs', CASE
            WHEN coalesce(data #> '{organization,sameAs}', '[]'::jsonb) @> '["https://x.com/BackpageNew"]'::jsonb
              THEN coalesce(data #> '{organization,sameAs}', '[]'::jsonb)
            ELSE coalesce(data #> '{organization,sameAs}', '[]'::jsonb) || '["https://x.com/BackpageNew"]'::jsonb END))
  || jsonb_build_object('site', coalesce(data->'site', '{}'::jsonb)
       || jsonb_build_object('twitter', coalesce(nullif(data #>> '{site,twitter}', ''), '@BackpageNew')))
WHERE id = 1;
