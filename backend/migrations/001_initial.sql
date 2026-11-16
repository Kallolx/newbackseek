CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 username text NOT NULL UNIQUE, password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
 email_verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, actor_id uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE cities (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, country_code text NOT NULL,
 country text NOT NULL, region text NOT NULL, name text NOT NULL, href text NOT NULL UNIQUE
);
CREATE INDEX cities_region_idx ON cities(country_code, region, name);
CREATE TABLE categories (slug text PRIMARY KEY, name text NOT NULL, group_name text NOT NULL);
CREATE TABLE ads (
 id bigint GENERATED ALWAYS AS IDENTITY (START WITH 1001) PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id), category_slug text NOT NULL REFERENCES categories(slug),
 title text NOT NULL, description text NOT NULL, age integer CHECK(age BETWEEN 18 AND 120),
 location text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','published','paused','rejected','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 search_document tsvector GENERATED ALWAYS AS (to_tsvector('english', title || ' ' || description)) STORED
);
CREATE INDEX ads_search_idx ON ads USING gin(search_document);
CREATE INDEX ads_owner_idx ON ads(owner_id, created_at DESC);
CREATE TABLE placements (
 ad_id bigint NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
 city_id bigint NOT NULL REFERENCES cities(id), ranked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (ad_id, city_id)
);
CREATE INDEX placements_feed_idx ON placements(city_id, ranked_at DESC, ad_id DESC);
CREATE TABLE media (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id),
 ad_id bigint REFERENCES ads(id), purpose text NOT NULL DEFAULT 'ad' CHECK(purpose IN ('ad','verification')),
 object_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'uploading'
 CHECK(status IN ('uploading','queued','processing','ready','failed')),
 expected_bytes integer NOT NULL, content_type text NOT NULL, variants jsonb NOT NULL DEFAULT '{}',
 width integer, height integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_ad_idx ON media(ad_id) WHERE status = 'ready';
CREATE TABLE reports (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, ad_id bigint NOT NULL REFERENCES ads(id),
 reporter_id uuid REFERENCES users(id), reason text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','dismissed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE verifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
 media_id uuid NOT NULL REFERENCES media(id), notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid REFERENCES users(id),
 action text NOT NULL, target_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
