-- Sprint 5.8: parent-managed child interests for mission personalization

ALTER TABLE children
  ADD COLUMN IF NOT EXISTS interests JSONB NOT NULL DEFAULT '[]'::jsonb;
