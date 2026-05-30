-- Sprint 4: missions, rewards, badges, child points

CREATE TABLE IF NOT EXISTS missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 20,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  trigger_reason VARCHAR(50),
  metadata JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_missions_child_status
  ON missions (child_id, status);

CREATE INDEX IF NOT EXISTS idx_missions_child_expires
  ON missions (child_id, expires_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  points_required INTEGER NOT NULL CHECK (points_required > 0),
  is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_by_child_id UUID REFERENCES children(id),
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rewards_parent
  ON rewards (parent_id);

CREATE TABLE IF NOT EXISTS badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon VARCHAR(50),
  requirement_type VARCHAR(50),
  requirement_value INTEGER,
  points_awarded INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS child_badges (
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (child_id, badge_id)
);

CREATE TABLE IF NOT EXISTS child_points (
  child_id UUID PRIMARY KEY REFERENCES children(id) ON DELETE CASCADE,
  total_points INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO badges (name, description, icon, requirement_type, requirement_value, points_awarded) VALUES
  ('First Mission', 'Complete your first mission', '🎯', 'missions_completed', 1, 10),
  ('Mission Master', 'Complete 10 missions', '🏆', 'missions_completed', 10, 50),
  ('Well-being Warrior', 'Achieve well-being score >=80 for 3 days', '💪', 'wellbeing_score_streak', 3, 30),
  ('Brain Trainer', 'Complete 5 cognitive remediation exercises', '🧠', 'cognitive_exercises_done', 5, 40),
  ('Risk Buster', 'Complete 3 missions triggered by risky content', '⚠️', 'trigger_reason_count', 3, 35)
ON CONFLICT (name) DO NOTHING;
