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

export interface ActiveMissionRow {
  id: string;
  title: string;
  description: string;
  points: number;
  status: string;
  metadata: Record<string, unknown> | null;
}

/** Most recent active (still-pending) mission, used to re-surface a blocking overlay. */
export async function getActivePendingMission(
  childId: string,
): Promise<ActiveMissionRow | null> {
  const { rows } = await query<ActiveMissionRow>(
    `SELECT id, title, description, points, status, metadata
     FROM missions
     WHERE child_id = $1
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [childId],
  );
  return rows[0] ?? null;
}

export async function countPendingMissions(childId: string): Promise<number> {
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status IN ('pending', 'pending_approval')
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
       AND status IN ('pending', 'pending_approval')
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

export async function getAdaptiveRiskThreshold(childId: string): Promise<number> {
  const { rows } = await query<{ avg_risk: string | null }>(
    `SELECT AVG(combined_risk_score) AS avg_risk
     FROM screen_events
     WHERE child_id = $1
       AND created_at > NOW() - INTERVAL '7 days'
       AND combined_risk_score IS NOT NULL`,
    [childId],
  );
  const avg = Number(rows[0]?.avg_risk ?? 0);
  return Math.min(80, Math.max(50, Math.round(avg + 10)));
}

export async function getCumulativeRisk(
  childId: string,
): Promise<{ sum: number; count: number }> {
  const { rows } = await query<{ sum: string; count: string }>(
    `SELECT COALESCE(SUM(combined_risk_score), 0) AS sum,
            COUNT(*)::text AS count
     FROM (
       SELECT combined_risk_score
       FROM screen_events
       WHERE child_id = $1
         AND created_at > NOW() - INTERVAL '30 minutes'
         AND combined_risk_score IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 5
     ) recent`,
    [childId],
  );
  return {
    sum: Number(rows[0]?.sum ?? 0),
    count: Number(rows[0]?.count ?? 0),
  };
}

export async function countRiskyMissionsLast24h(childId: string): Promise<number> {
  const { rows } = await query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM missions
     WHERE child_id = $1
       AND trigger_reason = 'risky_content'
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [childId],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function hasRecentRiskyMission(
  childId: string,
  minutes = 15,
): Promise<boolean> {
  const { rows } = await query(
    `SELECT 1 FROM missions
     WHERE child_id = $1
       AND trigger_reason = 'risky_content'
       AND created_at > NOW() - ($2::text || ' minutes')::interval
     LIMIT 1`,
    [childId, String(minutes)],
  );
  return rows.length > 0;
}
