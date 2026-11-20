-- Google Search Console was verified by DNS and the sitemap was accepted: no verification code is needed.
UPDATE seo_settings SET data = data || jsonb_build_object('connected',
  coalesce(data->'connected', '{"google": false, "bing": false}'::jsonb) || '{"google": true}'::jsonb)
WHERE id = 1;
