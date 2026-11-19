-- SEO control panel: site-wide settings, per-page overrides, redirects, and the IndexNow submission log.
CREATE TABLE IF NOT EXISTS seo_settings (
  id int PRIMARY KEY CHECK (id = 1),
  data jsonb NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO seo_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS seo_pages (
  path text PRIMARY KEY,
  title text, description text, h1 text, intro text, canonical text, og_image text,
  noindex boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seo_redirects (
  from_path text PRIMARY KEY,
  to_path text,
  status int NOT NULL DEFAULT 301 CHECK (status IN (301, 302, 307, 308, 410)),
  hits bigint NOT NULL DEFAULT 0,
  note text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seo_submissions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  engine text NOT NULL, url_count int NOT NULL, ok boolean NOT NULL, status_code int, note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seo_submissions_recent_idx ON seo_submissions (created_at DESC);

-- Sitemap / "latest changes" queries: published ads ordered by last change.
CREATE INDEX IF NOT EXISTS ads_published_updated_idx ON ads (updated_at DESC, id) WHERE status = 'published';
