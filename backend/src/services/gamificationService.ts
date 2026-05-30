import { query } from '../db/pool';
import {
  countCognitiveExercisesCompleted,
  countCompletedMissions,
  countRiskyContentMissionsCompleted,
  getWellbeingStreak,
} from './missionHelpers';

export interface ChildBadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  requirement_type: string | null;
  requirement_value: number | null;
  points_awarded: number;
  earned_at: string;
}

interface BadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  requirement_type: string | null;
  requirement_value: number | null;
  points_awarded: number;
}

export async function addPoints(childId: string, points: number): Promise<void> {
  if (points <= 0) {
    return;
  }
  await query(
    `INSERT INTO child_points (child_id, total_points)
     VALUES ($1, $2)
     ON CONFLICT (child_id) DO UPDATE
       SET total_points = child_points.total_points + $2,
           updated_at = NOW()`,
    [childId, points],
  );
}

export async function getChildPoints(childId: string): Promise<number> {
  const { rows } = await query<{ total_points: number }>(
    `SELECT total_points FROM child_points WHERE child_id = $1`,
    [childId],
  );
  return rows[0]?.total_points ?? 0;
}

async function hasBadge(childId: string, badgeId: string): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM child_badges WHERE child_id = $1 AND badge_id = $2
     ) AS exists`,
    [childId, badgeId],
  );
  return rows[0]?.exists ?? false;
}

async function awardBadge(childId: string, badge: BadgeRow): Promise<boolean> {
  const already = await hasBadge(childId, badge.id);
  if (already) {
    return false;
  }

  await query(
    `INSERT INTO child_badges (child_id, badge_id) VALUES ($1, $2)`,
    [childId, badge.id],
  );

  if (badge.points_awarded > 0) {
    await addPoints(childId, badge.points_awarded);
  }

  return true;
}

async function meetsRequirement(
  childId: string,
  badge: BadgeRow,
): Promise<boolean> {
  const requirementType = badge.requirement_type;
  const requirementValue = badge.requirement_value ?? 0;

  if (!requirementType) {
    return false;
  }

  switch (requirementType) {
    case 'missions_completed': {
      const count = await countCompletedMissions(childId);
      return count >= requirementValue;
    }
    case 'total_points': {
      const points = await getChildPoints(childId);
      return points >= requirementValue;
    }
    case 'wellbeing_score_streak': {
      const streak = await getWellbeingStreak(childId);
      return streak >= requirementValue;
    }
    case 'cognitive_exercises_done': {
      const count = await countCognitiveExercisesCompleted(childId);
      return count >= requirementValue;
    }
    case 'trigger_reason_count': {
      const count = await countRiskyContentMissionsCompleted(childId);
      return count >= requirementValue;
    }
    default:
      return false;
  }
}

export async function checkAndAwardBadges(childId: string): Promise<string[]> {
  const { rows: badges } = await query<BadgeRow>(
    `SELECT id, name, description, icon, requirement_type, requirement_value, points_awarded
     FROM badges`,
  );

  const newlyAwarded: string[] = [];

  for (const badge of badges) {
    const eligible = await meetsRequirement(childId, badge);
    if (!eligible) {
      continue;
    }
    const awarded = await awardBadge(childId, badge);
    if (awarded) {
      newlyAwarded.push(badge.name);
    }
  }

  return newlyAwarded;
}

export async function getChildBadges(childId: string): Promise<ChildBadgeRow[]> {
  const { rows } = await query<ChildBadgeRow>(
    `SELECT b.id, b.name, b.description, b.icon, b.requirement_type,
            b.requirement_value, b.points_awarded, cb.earned_at
     FROM child_badges cb
     JOIN badges b ON b.id = cb.badge_id
     WHERE cb.child_id = $1
     ORDER BY cb.earned_at DESC`,
    [childId],
  );
  return rows;
}

export async function listAllBadgesWithEarnedStatus(
  childId?: string,
): Promise<Array<BadgeRow & { earned: boolean; earnedAt?: string }>> {
  if (!childId) {
    const { rows } = await query<BadgeRow>(
      `SELECT id, name, description, icon, requirement_type, requirement_value, points_awarded
       FROM badges ORDER BY name ASC`,
    );
    return rows.map((b) => ({ ...b, earned: false }));
  }

  const { rows } = await query<
    BadgeRow & { earned: boolean; earned_at: string | null }
  >(
    `SELECT b.id, b.name, b.description, b.icon, b.requirement_type,
            b.requirement_value, b.points_awarded,
            (cb.child_id IS NOT NULL) AS earned,
            cb.earned_at
     FROM badges b
     LEFT JOIN child_badges cb
       ON cb.badge_id = b.id AND cb.child_id = $1
     ORDER BY b.name ASC`,
    [childId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    requirement_type: row.requirement_type,
    requirement_value: row.requirement_value,
    points_awarded: row.points_awarded,
    earned: row.earned,
    earnedAt: row.earned_at ?? undefined,
  }));
}
