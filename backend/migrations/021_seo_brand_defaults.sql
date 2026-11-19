-- Fill in the brand pictures the site already has (only where the admin has not set their own).
UPDATE seo_settings SET data = data
  || jsonb_build_object('site', coalesce(data->'site', '{}'::jsonb)
       || jsonb_build_object('ogImage', coalesce(nullif(data #>> '{site,ogImage}', ''), 'https://backpagenew.com/og-default.png')))
  || jsonb_build_object('organization', coalesce(data->'organization', '{}'::jsonb)
       || jsonb_build_object('logo', coalesce(nullif(data #>> '{organization,logo}', ''), 'https://backpagenew.com/brand/backpage-new-logo.png')))
WHERE id = 1;
