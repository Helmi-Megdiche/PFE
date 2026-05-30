-- Sprint 4.1: smart badge tiers (point, mission, age)

ALTER TABLE badges
  ADD COLUMN IF NOT EXISTS requirement_config JSONB;

-- Point badges (total_points)
INSERT INTO badges (name, description, icon, requirement_type, requirement_value, points_awarded) VALUES
  ('Rising Star', 'Reach 100 total points', '⭐', 'total_points', 100, 10),
  ('Explorer', 'Reach 500 total points', '🗺️', 'total_points', 500, 25),
  ('Shield', 'Reach 2,000 total points', '🛡️', 'total_points', 2000, 50),
  ('Champion', 'Reach 5,000 total points', '👑', 'total_points', 5000, 100),
  ('Legend', 'Reach 10,000 total points', '🏆', 'total_points', 10000, 200)
ON CONFLICT (name) DO NOTHING;

-- Mission badges (missions_completed)
INSERT INTO badges (name, description, icon, requirement_type, requirement_value, points_awarded) VALUES
  ('First Steps', 'Complete 1 mission', '👣', 'missions_completed', 1, 10),
  ('Helper', 'Complete 10 missions', '🤝', 'missions_completed', 10, 30),
  ('Hero', 'Complete 50 missions', '🦸', 'missions_completed', 50, 75),
  ('Super Hero', 'Complete 100 missions', '🦸‍♂️', 'missions_completed', 100, 150),
  ('Guardian Angel', 'Complete 500 missions', '😇', 'missions_completed', 500, 300)
ON CONFLICT (name) DO NOTHING;

-- Age badges (age_range) — min/max stored in requirement_config JSONB
INSERT INTO badges (name, description, icon, requirement_type, requirement_value, requirement_config, points_awarded) VALUES
  ('Little Explorer', 'Age 6-9 years', '🧒', 'age_range', NULL, '{"min":6,"max":9}', 20),
  ('Young Adventurer', 'Age 10-12 years', '🧑', 'age_range', NULL, '{"min":10,"max":12}', 30),
  ('Teen Champion', 'Age 13-17 years', '🧑‍🎤', 'age_range', NULL, '{"min":13,"max":17}', 40),
  ('Master', 'Age 18+ years', '🧙', 'age_range', NULL, '{"min":18,"max":999}', 50)
ON CONFLICT (name) DO NOTHING;
