DELETE FROM sessions USING users WHERE sessions.user_id=users.id AND users.email_verified_at IS NULL;
