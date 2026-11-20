-- Official Bluesky profile (structured data sameAs).
UPDATE seo_settings SET data = jsonb_set(data, '{organization,sameAs}',
  CASE WHEN coalesce(data #> '{organization,sameAs}', '[]'::jsonb) @> '["https://bsky.app/profile/backpagenew.bsky.social"]'::jsonb
       THEN coalesce(data #> '{organization,sameAs}', '[]'::jsonb)
       ELSE coalesce(data #> '{organization,sameAs}', '[]'::jsonb) || '["https://bsky.app/profile/backpagenew.bsky.social"]'::jsonb END, true)
WHERE id = 1 AND data ? 'organization';
