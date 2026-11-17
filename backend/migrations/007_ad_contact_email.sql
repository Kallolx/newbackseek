-- Public contact addresses are supplied for ads, not taken from login identities.
ALTER TABLE ads ADD COLUMN contact_email text NOT NULL DEFAULT '';
