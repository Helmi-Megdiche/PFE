import { query } from '../db/pool';
import {
  countCognitiveExercisesCompleted,
  countCompletedMissions,
  countRiskyContentMissionsCompleted,
  getChildAge,
  getWellbeingStreak,
} from './missionHelpers';

export interface AgeRange {
  min: number;
  max: number;
}

export interface ChildBadgeRow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  requirement_type: string | null;
  requirement_value: number | null;
  requirement_config: Record<string, unknown> | null;
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
  requirement_config: Record<string, unknown> | null;
  points_awarded: number;
}

export function parseAgeRange(badge: BadgeRow): AgeRange | null {
  const cfg = badge.requirement_config;
  if (!cfg || typeof cfg !== 'object') {
    return null;
  }
  const min = Number((cfg as Record<string, unknown>).min);
  const max = Number((cfg as Record<string, unknown>).max);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return { min, max };
}

export function ageMatchesRange(age: number, range: AgeRange): boolean {
  return age >= range.min && age <= range.max;
}

/** Legacy Sprint 4 badges superseded by First Steps / Helper (removed in 015). */
export const LEGACY_DUPLICATE_BADGE_NAMES = ['First Mission', 'Mission Master'] as const;

interface EarnedAgeBadgeRow extends BadgeRow {
  badge_id: string;
}

/**
 * Remove age-band badges that no longer match the child's current age.
 * Deducts bonus points that were awarded with each revoked badge.
 */
export async function revokeMismatchedAgeBadges(childId: string): Promise<string[]> {
  const age = await getChildAge(childId);
  if (age == null) {
    return [];
  }

  const { rows } = await query<EarnedAgeBadgeRow>(
    `SELECT b.id AS badge_id, b.name, b.description, b.icon, b.requirement_type,
            b.requirement_value, b.requirement_config, b.points_awarded
     FROM child_badges cb
     JOIN badges b ON b.id = cb.badge_id
     WHERE cb.child_id = $1 AND b.requirement_type = 'age_range'`,
    [childId],
  );

  const revoked: string[] = [];
  for (const badge of rows) {
    const range = parseAgeRange(badge);
    if (range == null || ageMatchesRange(age, range)) {
      continue;
    }
    await query(
      `DELETE FROM child_badges WHERE child_id = $1 AND badge_id = $2`,
      [childId, badge.badge_id],
    );
    if (badge.points_awarded > 0) {
      await deductPoints(childId, badge.points_awarded);
    }
    revoked.push(badge.name);
  }

  return revoked;
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

export async function deductPoints(childId: string, amount: number): Promise<number> {
  if (amount <= 0) {
    return getChildPoints(childId);
  }
  await query(
    `INSERT INTO child_points (child_id, total_points)
     VALUES ($1, 0)
     ON CONFLICT (child_id) DO NOTHING`,
    [childId],
  );
  const { rows } = await query<{ total_points: number }>(
    `UPDATE child_points
     SET total_points = GREATEST(0, total_points - $2),
         updated_at = NOW()
     WHERE child_id = $1
     RETURNING total_points`,
    [childId, amount],
  );
  return rows[0]?.total_points ?? 0;
}

export async function getChildPoints(childId: string): Promise<number> {
  const { rows } = await query<{ total_points: number }>(
    `SELECT total_points FROM child_points WHERE child_id = $1`,
    [childId],
  );
  return rows[0]?.total_points ?? 0;
}

/** Player level from lifetime points: 1 at 0–499, 2 at 500–999, etc. */
export function getChildLevel(totalPoints: number): number {
  const points = Math.max(0, Math.floor(totalPoints));
  return Math.floor(points / 500) + 1;
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

export async function awardBadgeById(
  childId: string,
  badge: BadgeRow,
): Promise<boolean> {
  const already = await hasBadge(childId, badge.id);
  if (already) {
    return false;
  }

  await query(
    `INSERT INTO child_badges (child_id, badge_id) VALUES ($1, $2)
     ON CONFLICT (child_id, badge_id) DO NOTHING`,
    [childId, badge.id],
  );

  if (await hasBadge(childId, badge.id)) {
    if (badge.points_awarded > 0) {
      await addPoints(childId, badge.points_awarded);
    }
    return true;
  }

  return false;
}

async function meetsRequirement(
  childId: string,
  badge: BadgeRow,
  age: number | null,
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
    case 'age_range': {
      if (age == null) {
        return false;
      }
      const range = parseAgeRange(badge);
      return range != null && ageMatchesRange(age, range);
    }
    default:
      return false;
  }
}

export async function checkAndAwardBadges(childId: string): Promise<string[]> {
  const { rows: badges } = await query<BadgeRow>(
    `SELECT id, name, description, icon, requirement_type,
            requirement_value, requirement_config, points_awarded
     FROM badges`,
  );

  const age = await getChildAge(childId);
  const newlyAwarded: string[] = [];

  for (const badge of badges) {
    const eligible = await meetsRequirement(childId, badge, age);
    if (!eligible) {
      continue;
    }
    const awarded = await awardBadgeById(childId, badge);
    if (awarded) {
      newlyAwarded.push(badge.name);
    }
  }

  return newlyAwarded;
}

export async function getChildBadges(childId: string): Promise<ChildBadgeRow[]> {
  const { rows } = await query<ChildBadgeRow>(
    `SELECT b.id, b.name, b.description, b.icon, b.requirement_type,
            b.requirement_value, b.requirement_config, b.points_awarded, cb.earned_at
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
): Promise<
  Array<BadgeRow & { earned: boolean; earnedAt?: string; category?: string }>
> {
  const withCategory = (badge: BadgeRow) => ({
    ...badge,
    category: badgeCategory(badge.requirement_type),
  });

  if (!childId) {
    const { rows } = await query<BadgeRow>(
      `SELECT id, name, description, icon, requirement_type,
              requirement_value, requirement_config, points_awarded
       FROM badges ORDER BY requirement_type ASC, requirement_value ASC NULLS LAST, name ASC`,
    );
    return rows.map((b) => ({ ...withCategory(b), earned: false }));
  }

  const { rows } = await query<
    BadgeRow & { earned: boolean; earned_at: string | null }
  >(
    `SELECT b.id, b.name, b.description, b.icon, b.requirement_type,
            b.requirement_value, b.requirement_config, b.points_awarded,
            (cb.child_id IS NOT NULL) AS earned,
            cb.earned_at
     FROM badges b
     LEFT JOIN child_badges cb
       ON cb.badge_id = b.id AND cb.child_id = $1
     ORDER BY b.requirement_type ASC, b.requirement_value ASC NULLS LAST, b.name ASC`,
    [childId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    requirement_type: row.requirement_type,
    requirement_value: row.requirement_value,
    requirement_config: row.requirement_config,
    points_awarded: row.points_awarded,
    earned: row.earned,
    earnedAt: row.earned_at ?? undefined,
    category: badgeCategory(row.requirement_type),
  }));
}

export function badgeCategory(
  requirementType: string | null,
): 'point' | 'mission' | 'age' | 'special' {
  switch (requirementType) {
    case 'total_points':
      return 'point';
    case 'missions_completed':
      return 'mission';
    case 'age_range':
      return 'age';
    default:
      return 'special';
  }
}
