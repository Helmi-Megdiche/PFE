import { query } from '../db/pool';
import { toScoreDateString } from './aggregateUsage';

const DEFAULT_BEDTIME_VARIANCE_MINUTES = 30;
const MAX_PHYSICAL_ACTIVITY_MINUTES = 60;
const MINUTES_PER_PHYSICAL_MISSION = 10;

/**
 * Completed real-world physical missions on score date → proxy activity minutes.
 */
export async function fetchPhysicalActivityMinutes(
  childId: string,
  scoreDate: Date,
): Promise<number> {
  const dateStr = toScoreDateString(scoreDate);
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status = 'completed'
       AND metadata->>'type' = 'real_world'
       AND (
         metadata->>'templateKey' = 'physical_activity'
         OR metadata->>'action' IN ('jumping_jacks', 'outdoor', 'sport', 'physical_activity')
       )
       AND completed_at >= $2::date
       AND completed_at < ($2::date + INTERVAL '1 day')`,
    [childId, dateStr],
  );
  const count = Number(rows[0]?.count ?? 0);
  return Math.min(count * MINUTES_PER_PHYSICAL_MISSION, MAX_PHYSICAL_ACTIVITY_MINUTES);
}

/**
 * Stddev of daily last-session end times over the 7-day window ending score date.
 * Falls back to 30 minutes when insufficient data.
 */
export async function fetchBedtimeVarianceMinutes(
  childId: string,
  scoreDate: Date,
): Promise<number> {
  const dateStr = toScoreDateString(scoreDate);
  const { rows } = await query<{ variance_seconds: string | null }>(
    `SELECT STDDEV(
       EXTRACT(EPOCH FROM (daily_end AT TIME ZONE 'UTC')::time)
     )::text AS variance_seconds
     FROM (
       SELECT MAX(end_time) AS daily_end
       FROM usage_sessions
       WHERE child_id = $1
         AND end_time >= ($2::date - INTERVAL '6 days')
         AND end_time < ($2::date + INTERVAL '1 day')
       GROUP BY (end_time AT TIME ZONE 'UTC')::date
     ) daily_last_sessions`,
    [childId, dateStr],
  );

  const varianceSeconds = rows[0]?.variance_seconds;
  if (varianceSeconds == null || Number.isNaN(Number(varianceSeconds))) {
    return DEFAULT_BEDTIME_VARIANCE_MINUTES;
  }

  const minutes = Number(varianceSeconds) / 60;
  return Math.min(Math.max(minutes, 0), 180);
}

/**
 * Completed family-interaction missions on score date.
 */
export async function fetchFamilyInteractionCount(
  childId: string,
  scoreDate: Date,
): Promise<number> {
  const dateStr = toScoreDateString(scoreDate);
  const { rows } = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM missions
     WHERE child_id = $1
       AND status = 'completed'
       AND (
         metadata->>'templateKey' IN (
           'family_interaction', 'parent_discussion', 'safety_talk', 'kindness_mission'
         )
         OR metadata->>'action' IN (
           'board_game', 'discussion', 'parent_discussion', 'kind_message'
         )
       )
       AND completed_at >= $2::date
       AND completed_at < ($2::date + INTERVAL '1 day')`,
    [childId, dateStr],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * Age-based recommended daily screen cap in minutes.
 */
export async function fetchRecommendedScreenMinutes(
  childId: string,
): Promise<number> {
  const { rows } = await query<{ birth_year: number | null }>(
    `SELECT birth_year FROM children WHERE id = $1 LIMIT 1`,
    [childId],
  );
  const birthYear = rows[0]?.birth_year;
  if (birthYear == null) {
    return 180;
  }
  const age = new Date().getUTCFullYear() - birthYear;
  if (age < 10) {
    return 120;
  }
  if (age <= 12) {
    return 150;
  }
  return 180;
}
