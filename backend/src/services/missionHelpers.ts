import { query } from '../db/pool';

export interface DailyScoreSnapshot {
  addictionScore: number;
  wellbeingScore: number;
  date: string;
}

export interface MissionHistoryRow {
  id: string;
  title: string;
  status: string;
  trigger_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ChildParentRow {
  parent_id: string;
}

export async function getChildAge(childId: string): Promise<number | null> {
  const { rows } = await query<{ birth_year: number | null }>(
    `SELECT birth_year FROM children WHERE id = $1 LIMIT 1`,
    [childId],
  );
  const birthYear = rows[0]?.birth_year;
  if (birthYear == null) {
    return null;
  }
  return new Date().getUTCFullYear() - birthYear;
}

export async function getChildParentId(childId: string): Promise<string | null> {
  const { rows } = await query<ChildParentRow>(
    `SELECT parent_id FROM children WHERE id = $1 LIMIT 1`,
    [childId],
  );
  return rows[0]?.parent_id ?? null;
}

export async function getChildRecentScores(
  childId: string,
): Promise<DailyScoreSnapshot | null> {
  const { rows } = await query<{
    addiction_score: number;
    wellbeing_score: number;
    score_date: string;
  }>(
    `SELECT addiction_score, wellbeing_score, score_date
     FROM daily_scores
     WHERE child_id = $1
     ORDER BY score_date DESC
     LIMIT 1`,
    [childId],
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    addictionScore: row.addiction_score,
    wellbeingScore: row.wellbeing_score,
    date: row.score_date,
  };
}

export async function getChildMissionHistory(
  childId: string,
  limit: number,
): Promise<MissionHistoryRow[]> {
  const { rows } = await query<MissionHistoryRow>(
    `SELECT id, title, status, trigger_reason, metadata, created_at
     FROM missions
     WHERE child_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [childId, limit],
  );
  return rows;
}

export async function countPendingMissions(childId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status = 'pending'
       AND expires_at > NOW()`,
    [childId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function expireStaleMissions(childId: string): Promise<number> {
  const { rowCount } = await query(
    `UPDATE missions
     SET status = 'expired'
     WHERE child_id = $1
       AND status = 'pending'
       AND expires_at <= NOW()`,
    [childId],
  );
  return rowCount;
}

export async function getWellbeingStreak(childId: string): Promise<number> {
  const { rows } = await query<{ wellbeing_score: number; score_date: string }>(
    `SELECT wellbeing_score, score_date
     FROM daily_scores
     WHERE child_id = $1
     ORDER BY score_date DESC
     LIMIT 30`,
    [childId],
  );

  let streak = 0;
  for (const row of rows) {
    if (row.wellbeing_score >= 80) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export async function countCompletedMissions(childId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1 AND status = 'completed'`,
    [childId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countCognitiveExercisesCompleted(
  childId: string,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status = 'completed'
       AND metadata->>'type' = 'cognitive'`,
    [childId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function countRiskyContentMissionsCompleted(
  childId: string,
): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status = 'completed'
       AND trigger_reason = 'risky_content'`,
    [childId],
  );
  return Number(rows[0]?.count ?? 0);
}
