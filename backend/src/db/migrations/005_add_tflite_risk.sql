-- Sprint 3: on-device image classification fields on screen_events

ALTER TABLE screen_events
  ADD COLUMN IF NOT EXISTS image_risk_score INTEGER
    CHECK (image_risk_score IS NULL OR (image_risk_score >= 0 AND image_risk_score <= 100)),
  ADD COLUMN IF NOT EXISTS image_classification_json JSONB,
  ADD COLUMN IF NOT EXISTS combined_risk_score INTEGER
    CHECK (combined_risk_score IS NULL OR (combined_risk_score >= 0 AND combined_risk_score <= 100));

CREATE INDEX IF NOT EXISTS idx_screen_events_combined_risk
  ON screen_events (child_id, combined_risk_score DESC NULLS LAST)
  WHERE combined_risk_score IS NOT NULL;
