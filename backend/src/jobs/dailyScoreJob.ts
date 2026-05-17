import cron from 'node-cron';
import { query } from '../db/pool';
import { logger } from '../utils/logger';
import {
  aggregateSessionsForDay,
  buildDailyStats,
  sessionDurationMinutes,
  toScoreDateString,
  weekOverWeekChangePercent,
  addictionStatsFromWellbeing,
} from '../scoring/aggregateUsage';
import {
  computeAddictionScore,
  computeWellbeingScore,
} from '../scoring/scoringEngine';
import type { UsageSessionRecord } from '../scoring/aggregateUsage';

interface ChildRow {
  id: string;
}

interface UsageSessionRow extends UsageSessionRecord {
  start_time: Date;
  end_time: Date;
  app_category: string | null;
}

async function fetchSessionsForDate(
  childId: string,
  scoreDate: string,
): Promise<UsageSessionRow[]> {
  const { rows } = await query<UsageSessionRow>(
    `SELECT start_time, end_time, app_category
     FROM usage_sessions
     WHERE child_id = $1
       AND start_time >= $2::date
       AND start_time < ($2::date + INTERVAL '1 day')`,
    [childId, scoreDate],
  );
  return rows;
}

async function totalMinutesForDate(
  childId: string,
  scoreDate: string,
): Promise<number> {
  const sessions = await fetchSessionsForDate(childId, scoreDate);
  return sessions.reduce(
    (sum, s) => sum + sessionDurationMinutes(s.start_time, s.end_time),
    0,
  );
}

export async function computeAndStoreDailyScore(
  childId: string,
  scoreDate: Date,
): Promise<void> {
  const dateStr = toScoreDateString(scoreDate);

  const sessions = await fetchSessionsForDate(childId, dateStr);
  const dayAggregate = aggregateSessionsForDay(sessions);

  const compareDate = new Date(scoreDate);
  compareDate.setUTCDate(compareDate.getUTCDate() - 7);
  const compareStr = toScoreDateString(compareDate);
  const lastWeekMinutes = await totalMinutesForDate(childId, compareStr);
  const wow = weekOverWeekChangePercent(
    dayAggregate.totalScreenMinutes,
    lastWeekMinutes,
  );

  const stats = buildDailyStats(dayAggregate, wow, {
    physicalActivityMinutes: 0,
    bedtimeVarianceMinutes: 30,
    familyCallsMessages: 0,
    recommendedScreenMinutes: 180,
  });

  const addiction = computeAddictionScore(addictionStatsFromWellbeing(stats));
  const wellbeing = computeWellbeingScore(stats);

  await query(
    `INSERT INTO daily_scores (
      child_id, score_date, addiction_score, wellbeing_score,
      intensity, compulsivity, night_usage, escalation, real_imbalance,
      screen_balance, content_quality, real_activity, sleep_consistency, family_interaction
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (child_id, score_date) DO UPDATE SET
      addiction_score = EXCLUDED.addiction_score,
      wellbeing_score = EXCLUDED.wellbeing_score,
      intensity = EXCLUDED.intensity,
      compulsivity = EXCLUDED.compulsivity,
      night_usage = EXCLUDED.night_usage,
      escalation = EXCLUDED.escalation,
      real_imbalance = EXCLUDED.real_imbalance,
      screen_balance = EXCLUDED.screen_balance,
      content_quality = EXCLUDED.content_quality,
      real_activity = EXCLUDED.real_activity,
      sleep_consistency = EXCLUDED.sleep_consistency,
      family_interaction = EXCLUDED.family_interaction`,
    [
      childId,
      dateStr,
      addiction.score,
      wellbeing.score,
      addiction.components.intensity,
      addiction.components.compulsivity,
      addiction.components.nightUsage,
      addiction.components.escalation,
      addiction.components.realImbalance,
      wellbeing.components.screenBalance,
      wellbeing.components.contentQuality,
      wellbeing.components.realActivity,
      wellbeing.components.sleepConsistency,
      wellbeing.components.familyInteraction,
    ],
  );

  logger.info('Daily score computed', {
    childId,
    scoreDate: dateStr,
    addictionScore: addiction.score,
    wellbeingScore: wellbeing.score,
    sessionCount: sessions.length,
  });
}

/** Process all children for the previous calendar day (UTC). */
export async function runDailyScoreJob(): Promise<void> {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);

  const { rows: children } = await query<ChildRow>(
    `SELECT id FROM children`,
  );

  logger.info('Starting daily score job', {
    childCount: children.length,
    scoreDate: toScoreDateString(yesterday),
  });

  for (const child of children) {
    try {
      await computeAndStoreDailyScore(child.id, yesterday);
    } catch (err) {
      logger.error('Daily score failed for child', {
        childId: child.id,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

/** Schedule at 01:00 every day (server local timezone). */
export function scheduleDailyScoreJob(): void {
  cron.schedule('0 1 * * *', () => {
    void runDailyScoreJob().catch((err) => {
      logger.error('Daily score cron failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  });
  logger.info('Daily score cron scheduled (01:00 daily)');
}
