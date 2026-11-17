-- Optional: the admin panel only answers allowlisted addresses (e.g. the admin VPN).
ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS admin_allowlist_only boolean NOT NULL DEFAULT false;
