import { Router, Response } from 'express';
import {
  requireChildRole,
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validate';
import {
  createScreenEventSchema,
  listScreenEventsQuerySchema,
} from '../validators/screenEvents.validator';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

interface ScreenEventRow {
  id: string;
  child_id: string;
  timestamp: string;
  app_package: string;
  extracted_text_preview: string;
  risk_flag: boolean;
  risk_score: number | null;
  category: string | null;
  created_at: string;
}

/**
 * POST /api/screen-events
 * Child app — JWT verified by global verifyToken middleware.
 */
router.post(
  '/',
  requireChildRole,
  validateBody(createScreenEventSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const {
      timestamp,
      appPackage,
      extractedTextPreview,
      riskFlag,
      riskScore,
      category,
    } = req.body;

    try {
      const { rows } = await query<ScreenEventRow>(
        `INSERT INTO screen_events (
          child_id, timestamp, app_package, extracted_text_preview,
          risk_flag, risk_score, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, child_id, timestamp, app_package, extracted_text_preview,
                  risk_flag, risk_score, category, created_at`,
        [
          childId,
          timestamp,
          appPackage,
          extractedTextPreview,
          riskFlag,
          riskScore ?? null,
          category ?? null,
        ],
      );

      const event = rows[0];
      logger.info('Screen event stored', {
        eventId: event.id,
        childId,
        riskFlag,
        appPackage,
      });

      res.status(201).json({
        id: event.id,
        childId: event.child_id,
        timestamp: event.timestamp,
        appPackage: event.app_package,
        extractedTextPreview: event.extracted_text_preview,
        riskFlag: event.risk_flag,
        riskScore: event.risk_score,
        category: event.category,
        createdAt: event.created_at,
      });
    } catch (err) {
      logger.error('Failed to insert screen event', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to store screen event' });
    }
  },
);

/**
 * GET /api/screen-events/:childId
 * Parent preview — JWT + parent role required.
 */
router.get(
  '/:childId',
  requireParentRole,
  validateQuery(listScreenEventsQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const { limit } = req.query as { limit: number };

    try {
      const { rows } = await query<ScreenEventRow>(
        `SELECT id, child_id, timestamp, app_package, extracted_text_preview,
                risk_flag, risk_score, category, created_at
         FROM screen_events
         WHERE child_id = $1
         ORDER BY timestamp DESC
         LIMIT $2`,
        [childId, limit],
      );

      res.json({
        childId,
        events: rows.map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          appPackage: e.app_package,
          extractedTextPreview: e.extracted_text_preview,
          riskFlag: e.risk_flag,
          riskScore: e.risk_score,
          category: e.category,
          createdAt: e.created_at,
        })),
      });
    } catch (err) {
      logger.error('Failed to list screen events', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch screen events' });
    }
  },
);

export default router;
