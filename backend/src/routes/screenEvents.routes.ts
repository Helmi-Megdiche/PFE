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
import { generateMissionFromRisk } from '../services/missionGenerator';
import { getActivePendingMission } from '../services/missionHelpers';

const router = Router();

interface ScreenEventRow {
  id: string;
  child_id: string;
  timestamp: string;
  app_package: string;
  app_label: string | null;
  extracted_text_preview: string;
  risk_flag: boolean;
  risk_score: number | null;
  image_risk_score: number | null;
  image_classification_json: Record<string, unknown> | null;
  combined_risk_score: number | null;
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
      appLabel,
      extractedTextPreview,
      riskFlag,
      riskScore,
      imageRiskScore,
      combinedRiskScore,
      imageClassificationDetails,
      category,
    } = req.body;

    try {
      const { rows } = await query<ScreenEventRow>(
        `INSERT INTO screen_events (
          child_id, timestamp, app_package, app_label, extracted_text_preview,
          risk_flag, risk_score, image_risk_score, image_classification_json,
          combined_risk_score, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, child_id, timestamp, app_package, app_label, extracted_text_preview,
                  risk_flag, risk_score, image_risk_score, image_classification_json,
                  combined_risk_score, category, created_at`,
        [
          childId,
          timestamp,
          appPackage,
          appLabel ?? null,
          extractedTextPreview,
          riskFlag,
          riskScore ?? null,
          imageRiskScore ?? null,
          imageClassificationDetails
            ? JSON.stringify(imageClassificationDetails)
            : null,
          combinedRiskScore ?? null,
          category ?? null,
        ],
      );

      const event = rows[0];
      logger.info('Screen event stored', {
        eventId: event.id,
        childId,
        riskFlag,
        combinedRiskScore: event.combined_risk_score,
        imageRiskScore: event.image_risk_score,
        appPackage,
      });

      let newMission: Record<string, unknown> | null = null;
      let missionGeneration: { created: boolean; reason?: string } | null = null;
      if (combinedRiskScore != null) {
        try {
          const missionResult = await generateMissionFromRisk(
            childId,
            combinedRiskScore,
            category ?? 'neutral',
          );
          missionGeneration = {
            created: missionResult.created,
            ...(missionResult.reason ? { reason: missionResult.reason } : {}),
          };
          if (missionResult.created && missionResult.missionId) {
            const { rows: missionRows } = await query<{
              id: string;
              title: string;
              description: string;
              points: number;
              status: string;
              metadata: Record<string, unknown> | null;
            }>(
              `SELECT id, title, description, points, status, metadata
               FROM missions WHERE id = $1 LIMIT 1`,
              [missionResult.missionId],
            );
            const m = missionRows[0];
            if (m) {
              const meta = (m.metadata ?? {}) as Record<string, unknown>;
              newMission = {
                id: m.id,
                title: m.title,
                description: m.description,
                points: m.points,
                status: m.status,
                type: meta.type ?? 'real_world',
                metadata: meta,
              };
            }
          }
          // Re-surface an existing pending mission so the child cannot keep
          // browsing risky content during cooldown / when the pending limit is hit.
          if (
            !newMission &&
            event.risk_flag &&
            (missionResult.reason === 'cooldown_active' ||
              missionResult.reason === 'pending_limit_reached')
          ) {
            const active = await getActivePendingMission(childId);
            if (active) {
              const meta = (active.metadata ?? {}) as Record<string, unknown>;
              newMission = {
                id: active.id,
                title: active.title,
                description: active.description,
                points: active.points,
                status: active.status,
                type: meta.type ?? 'real_world',
                metadata: meta,
                reSurfaced: true,
              };
            }
          }
        } catch (missionErr) {
          logger.error('Mission generation from screen event failed', {
            childId,
            combinedRiskScore,
            err:
              missionErr instanceof Error ? missionErr.message : String(missionErr),
          });
        }
      }

      res.status(201).json({
        id: event.id,
        childId: event.child_id,
        timestamp: event.timestamp,
        appPackage: event.app_package,
        appLabel: event.app_label,
        extractedTextPreview: event.extracted_text_preview,
        riskFlag: event.risk_flag,
        riskScore: event.risk_score,
        imageRiskScore: event.image_risk_score,
        imageClassificationDetails: event.image_classification_json,
        combinedRiskScore: event.combined_risk_score,
        category: event.category,
        createdAt: event.created_at,
        newMission,
        missionGeneration,
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
    const { limit } = req.query as unknown as { limit: number };

    try {
      const { rows } = await query<ScreenEventRow>(
        `SELECT id, child_id, timestamp, app_package, app_label, extracted_text_preview,
                risk_flag, risk_score, image_risk_score, image_classification_json,
                combined_risk_score, category, created_at
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
          appLabel: e.app_label,
          extractedTextPreview: e.extracted_text_preview,
          riskFlag: e.risk_flag,
          riskScore: e.risk_score,
          imageRiskScore: e.image_risk_score,
          imageClassificationDetails: e.image_classification_json,
          combinedRiskScore: e.combined_risk_score,
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
