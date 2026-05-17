-- Sprint 1: screen content metadata (no images stored)
CREATE TABLE IF NOT EXISTS screen_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  app_package VARCHAR(255) NOT NULL,
  extracted_text_preview VARCHAR(500) NOT NULL DEFAULT '',
  risk_flag BOOLEAN NOT NULL DEFAULT FALSE,
  risk_score NUMERIC(5, 2) CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)),
  category VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_screen_events_child_timestamp
  ON screen_events (child_id, timestamp DESC);
