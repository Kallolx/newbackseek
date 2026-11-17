-- Deleted accounts retain their own history but no longer reserve login identities.
-- Suspended accounts continue to reserve them so signup cannot bypass a suspension.
ALTER TABLE users DROP CONSTRAINT users_email_key;
ALTER TABLE users DROP CONSTRAINT users_username_key;
ALTER TABLE users DROP CONSTRAINT users_google_subject_key;
CREATE UNIQUE INDEX users_live_email_key ON users(email) WHERE status <> 'deleted';
CREATE UNIQUE INDEX users_live_username_key ON users(username) WHERE status <> 'deleted';
CREATE UNIQUE INDEX users_live_google_subject_key ON users(google_subject) WHERE status <> 'deleted';
