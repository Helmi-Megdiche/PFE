import { Router, Response } from 'express';
import { requireParentRole, AuthenticatedRequest } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import {
  getScoreQuerySchema,
  scoreTrendQuerySchema,
} from '../validators/scores.validator';
import { query } from '../db/pool';
import { getChildLevel, getChildPoints } from '../services/gamificationService';
import { logger } from '../utils/logger';

const router = Router();

interface DailyScoreRow {
  id: string;
  child_id: string;
  score_date: string;
  addiction_score: number;
  wellbeing_score: number;
  intensity: number | null;
  compulsivity: number | null;
  night_usage: number | null;
  escalation: number | null;
  real_imbalance: number | null;
  screen_balance: number | null;
  content_quality: number | null;
  real_activity: number | null;
  sleep_consistency: number | null;
  family_interaction: number | null;
  created_at: string;
}

function formatScoreDate(scoreDate: string | Date): string {
  if (scoreDate instanceof Date) {
    return scoreDate.toISOString().slice(0, 10);
  }
  return String(scoreDate).slice(0, 10);
}

function mapScoreRow(row: DailyScoreRow) {
  return {
    id: row.id,
    childId: row.child_id,
    date: formatScoreDate(row.score_date as string | Date),
    addictionScore: row.addiction_score,
    wellbeingScore: row.wellbeing_score,
    components: {
      addiction: {
        intensity: row.intensity,
        compulsivity: row.compulsivity,
        nightUsage: row.night_usage,
        escalation: row.escalation,
        realImbalance: row.real_imbalance,
      },
      wellbeing: {
        screenBalance: row.screen_balance,
        contentQuality: row.content_quality,
        realActivity: row.real_activity,
        sleepConsistency: row.sleep_consistency,
        familyInteraction: row.family_interaction,
      },
    },
    createdAt: row.created_at,
  };
}

/**
 * GET /api/scores/:childId/trend?days=7 — must be registered before /:childId.
 */
router.get(
  '/:childId/trend',
  requireParentRole,
  validateQuery(scoreTrendQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const { days } = req.query as unknown as { days: number };

    try {
      const { rows } = await query<DailyScoreRow>(
        `SELECT id, child_id, score_date, addiction_score, wellbeing_score,
                intensity, compulsivity, night_usage, escalation, real_imbalance,
                screen_balance, content_quality, real_activity, sleep_consistency,
                family_interaction, created_at
         FROM daily_scores
         WHERE child_id = $1
           AND score_date >= (CURRENT_DATE - $2::int)
         ORDER BY score_date ASC`,
        [childId, days],
      );

      res.json({
        childId,
        days,
        scores: rows.map(mapScoreRow),
      });
    } catch (err) {
      logger.error('Failed to fetch score trend', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch score trend' });
    }
  },
);

/**
 * GET /api/scores/:childId?date=YYYY-MM-DD — latest score if date omitted.
 */
router.get(
  '/:childId',
  requireParentRole,
  validateQuery(getScoreQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const { date } = req.query as { date?: string };

    try {
      const { rows } = await query<DailyScoreRow>(
        date
          ? `SELECT id, child_id, score_date, addiction_score, wellbeing_score,
                    intensity, compulsivity, night_usage, escalation, real_imbalance,
                    screen_balance, content_quality, real_activity, sleep_consistency,
                    family_interaction, created_at
             FROM daily_scores
             WHERE child_id = $1 AND score_date = $2::date
             LIMIT 1`
          : `SELECT id, child_id, score_date, addiction_score, wellbeing_score,
                    intensity, compulsivity, night_usage, escalation, real_imbalance,
                    screen_balance, content_quality, real_activity, sleep_consistency,
                    family_interaction, created_at
             FROM daily_scores
             WHERE child_id = $1
             ORDER BY score_date DESC
             LIMIT 1`,
        date ? [childId, date] : [childId],
      );

      if (rows.length === 0) {
        res.status(404).json({
          error: 'No scores found for this child and date',
          childId,
          date: date ?? null,
        });
        return;
      }

      const totalPoints = await getChildPoints(childId);
      const level = getChildLevel(totalPoints);

      res.json({
        ...mapScoreRow(rows[0]),
        totalPoints,
        level,
      });
    } catch (err) {
      logger.error('Failed to fetch daily score', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch daily score' });
    }
  },
);

export default router;
