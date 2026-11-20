-- Shorter recommended wording so Google does not cut it off. Only replaces text that is still the old recommended text.
UPDATE seo_settings SET data = jsonb_set(data, '{templates,city,description}', to_jsonb('Free classifieds and personal ads in {city}, {region}: dating, services, jobs, rentals and more. {adsLine} Post your own ad on {site}.'::text))
WHERE id = 1 AND data #>> '{templates,city,description}' = 'Browse free classifieds and personal ads in {city}, {region}: dating, services, jobs, rentals, for sale and more. {adsLine} Post your own ad free on {site}.';
UPDATE seo_settings SET data = jsonb_set(data, '{templates,home,title}', to_jsonb('BackpageNew – The New Backpage Alternative for Classifieds'::text))
WHERE id = 1 AND data #>> '{templates,home,title}' = 'BackpageNew – The New Backpage Alternative for Local Classifieds';
