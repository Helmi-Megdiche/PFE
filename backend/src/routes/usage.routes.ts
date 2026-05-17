import { Router, Response } from 'express';
import {
  requireChildRole,
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import { postUsageSchema, listUsageQuerySchema } from '../validators/usage.validator';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

interface UsageSessionRow {
  id: string;
  child_id: string;
  start_time: string;
  end_time: string;
  app_package: string;
  app_category: string;
  created_at: string;
}

/**
 * POST /api/usage — child JWT, batch insert usage sessions.
 */
router.post(
  '/',
  requireChildRole,
  validateBody(postUsageSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { sessions } = req.body as {
      sessions: Array<{
        startTime: string;
        endTime: string;
        appPackage: string;
        appCategory: string;
      }>;
    };

    try {
      let inserted = 0;
      for (const session of sessions) {
        await query(
          `INSERT INTO usage_sessions (
            child_id, start_time, end_time, app_package, app_category
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            childId,
            session.startTime,
            session.endTime,
            session.appPackage,
            session.appCategory ?? 'unknown',
          ],
        );
        inserted += 1;
      }

      logger.info('Usage sessions stored', { childId, count: inserted });
      res.status(201).json({ count: inserted });
    } catch (err) {
      logger.error('Failed to store usage sessions', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to store usage sessions' });
    }
  },
);

/**
 * GET /api/usage/:childId?date=YYYY-MM-DD — parent JWT.
 */
router.get(
  '/:childId',
  requireParentRole,
  validateQuery(listUsageQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const { date } = req.query as { date?: string };

    const day = date ?? new Date().toISOString().slice(0, 10);

    try {
      const { rows } = await query<UsageSessionRow>(
        `SELECT id, child_id, start_time, end_time, app_package, app_category, created_at
         FROM usage_sessions
         WHERE child_id = $1
           AND start_time >= $2::date
           AND start_time < ($2::date + INTERVAL '1 day')
         ORDER BY start_time ASC`,
        [childId, day],
      );

      res.json({
        childId,
        date: day,
        sessions: rows.map((row) => ({
          id: row.id,
          startTime: row.start_time,
          endTime: row.end_time,
          appPackage: row.app_package,
          appCategory: row.app_category,
          createdAt: row.created_at,
        })),
      });
    } catch (err) {
      logger.error('Failed to list usage sessions', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch usage sessions' });
    }
  },
);

export default router;
