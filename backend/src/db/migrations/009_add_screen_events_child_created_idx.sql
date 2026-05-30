-- Sprint 4.5: supports cumulative risk and adaptive threshold queries on created_at
CREATE INDEX IF NOT EXISTS idx_screen_events_child_created
  ON screen_events (child_id, created_at DESC);
