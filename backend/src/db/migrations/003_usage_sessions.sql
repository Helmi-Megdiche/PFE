-- Sprint 2: foreground usage sessions and daily aggregated scores

CREATE TABLE IF NOT EXISTS usage_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  app_package VARCHAR(255) NOT NULL,
  app_category VARCHAR(50) NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT usage_sessions_valid_range CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_usage_sessions_child_date
  ON usage_sessions (child_id, start_time);

CREATE TABLE IF NOT EXISTS daily_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  addiction_score INTEGER NOT NULL CHECK (addiction_score >= 0 AND addiction_score <= 100),
  wellbeing_score INTEGER NOT NULL CHECK (wellbeing_score >= 0 AND wellbeing_score <= 100),
  intensity INTEGER,
  compulsivity INTEGER,
  night_usage INTEGER,
  escalation INTEGER,
  real_imbalance INTEGER,
  screen_balance INTEGER,
  content_quality INTEGER,
  real_activity INTEGER,
  sleep_consistency INTEGER,
  family_interaction INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (child_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_scores_child_date
  ON daily_scores (child_id, score_date);
