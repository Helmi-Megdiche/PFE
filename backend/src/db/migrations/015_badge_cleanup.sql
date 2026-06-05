-- Sprint 5.9: Remove legacy duplicate mission badges and mismatched age badge awards.

-- 1. Legacy duplicates (superseded by First Steps / Helper in 008_add_smart_badges.sql)
WITH legacy AS (
  SELECT cb.child_id, COALESCE(SUM(b.points_awarded), 0)::int AS pts
  FROM child_badges cb
  INNER JOIN badges b ON b.id = cb.badge_id
  WHERE b.name IN ('First Mission', 'Mission Master')
  GROUP BY cb.child_id
)
UPDATE child_points cp
SET total_points = GREATEST(0, cp.total_points - legacy.pts),
    updated_at = NOW()
FROM legacy
WHERE cp.child_id = legacy.child_id;

DELETE FROM child_badges cb
USING badges b
WHERE cb.badge_id = b.id
  AND b.name IN ('First Mission', 'Mission Master');

DELETE FROM badges
WHERE name IN ('First Mission', 'Mission Master');

-- 2. Age badges that no longer match the child's current age (birth_year)
WITH mismatched AS (
  SELECT cb.child_id, COALESCE(SUM(b.points_awarded), 0)::int AS pts
  FROM child_badges cb
  INNER JOIN badges b ON b.id = cb.badge_id
  INNER JOIN children c ON c.id = cb.child_id
  WHERE b.requirement_type = 'age_range'
    AND c.birth_year IS NOT NULL
    AND NOT (
      (EXTRACT(YEAR FROM CURRENT_DATE)::int - c.birth_year)
        >= COALESCE((b.requirement_config->>'min')::int, 0)
      AND (EXTRACT(YEAR FROM CURRENT_DATE)::int - c.birth_year)
        <= COALESCE((b.requirement_config->>'max')::int, 999)
    )
  GROUP BY cb.child_id
)
UPDATE child_points cp
SET total_points = GREATEST(0, cp.total_points - mismatched.pts),
    updated_at = NOW()
FROM mismatched
WHERE cp.child_id = mismatched.child_id;

DELETE FROM child_badges cb
USING badges b, children c
WHERE cb.badge_id = b.id
  AND cb.child_id = c.id
  AND b.requirement_type = 'age_range'
  AND c.birth_year IS NOT NULL
  AND NOT (
    (EXTRACT(YEAR FROM CURRENT_DATE)::int - c.birth_year)
      >= COALESCE((b.requirement_config->>'min')::int, 0)
    AND (EXTRACT(YEAR FROM CURRENT_DATE)::int - c.birth_year)
      <= COALESCE((b.requirement_config->>'max')::int, 999)
  );
