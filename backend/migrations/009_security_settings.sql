-- Administrator-controlled protection settings (country blocking and origin lock).
CREATE TABLE IF NOT EXISTS security_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  geo_enabled boolean NOT NULL DEFAULT false,
  blocked_countries text[] NOT NULL DEFAULT ARRAY['BD']::text[],
  block_tor boolean NOT NULL DEFAULT false,
  block_unknown boolean NOT NULL DEFAULT false,
  protect_admin boolean NOT NULL DEFAULT false,
  cloudflare_only boolean NOT NULL DEFAULT true,
  allowlist text[] NOT NULL DEFAULT ARRAY[]::text[],
  edge_status text NOT NULL DEFAULT 'not_configured',
  edge_message text NOT NULL DEFAULT '',
  edge_synced_at timestamptz,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO security_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
