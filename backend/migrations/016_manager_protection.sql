-- The manager portal gets its own protection switches (it starts with the admin panel's current choices).
ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS protect_manager boolean NOT NULL DEFAULT false;
ALTER TABLE security_settings ADD COLUMN IF NOT EXISTS manager_allowlist_only boolean NOT NULL DEFAULT false;
UPDATE security_settings SET protect_manager = protect_admin, manager_allowlist_only = admin_allowlist_only;
