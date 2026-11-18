-- Post planner: ads prepared by the team that are published later (now, on a schedule, or in a batch) by the worker.
CREATE TABLE IF NOT EXISTS ad_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','queued','publishing','published','failed')),
  payload jsonb NOT NULL,
  media_ids uuid[] NOT NULL DEFAULT '{}',
  publish_at timestamptz,
  ad_id bigint REFERENCES ads(id),
  error text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX IF NOT EXISTS ad_drafts_owner_idx ON ad_drafts (created_by, status);
CREATE INDEX IF NOT EXISTS ad_drafts_due_idx ON ad_drafts (status, publish_at) WHERE status IN ('queued','scheduled','publishing');
