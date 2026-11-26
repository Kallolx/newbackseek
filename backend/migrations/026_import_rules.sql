-- Site-specific selectors taught from locally saved post pages.
CREATE TABLE admin_import_rules (
  domain text PRIMARY KEY,
  name text NOT NULL,
  selectors jsonb NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
