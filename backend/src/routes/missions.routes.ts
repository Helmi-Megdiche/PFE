import { Router, Response } from 'express';
import { env } from '../config/env';
import {
  requireChildRole,
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  completeMissionSchema,
  generateMissionDevSchema,
  suggestMissionSchema,
} from '../validators/missions.validator';
import { query } from '../db/pool';
import { logger } from '../utils/logger';
import {
  generateMissionFromHighAddiction,
  generateMissionFromLowWellbeing,
  generateMissionFromRisk,
} from '../services/missionGenerator';
import {
  evaluateMissionCompletion,
  type MissionCompletionPayload,
} from '../services/missionCompletion';
import {
  addPoints,
  checkAndAwardBadges,
  getChildBadges,
  getChildPoints,
} from '../services/gamificationService';
import { expireStaleMissions } from '../services/missionHelpers';

const router = Router();

interface MissionRow {
  id: string;
  child_id: string;
  title: string;
  description: string;
  points: number;
  status: string;
  trigger_reason: string | null;
  metadata: Record<string, unknown> | null;
  expires_at: string;
  created_at: string;
  completed_at: string | null;
}

function mapMission(row: MissionRow) {
  return {
    id: row.id,
    childId: row.child_id,
    title: row.title,
    description: row.description,
    points: row.points,
    status: row.status,
    triggerReason: row.trigger_reason,
    metadata: row.metadata,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

function assertChildAccess(
  req: AuthenticatedRequest,
  childId: string,
  res: Response,
): boolean {
  if (req.user?.role === 'parent') {
    return true;
  }
  if (req.user?.role === 'child' && req.user.childId === childId) {
    return true;
  }
  res.status(403).json({ error: 'Access denied for this child' });
  return false;
}

/**
 * POST /api/missions/suggest — mobile compatibility shim.
 */
router.post(
  '/suggest',
  requireChildRole,
  validateBody(suggestMissionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { category } = req.body as { category: string; textSnippet: string };

    try {
      const result = await generateMissionFromRisk(childId, 75, category);
      if (!result.created) {
        res.status(200).json({ id: null, created: false, reason: result.reason });
        return;
      }
      res.status(201).json({ id: result.missionId, created: true });
    } catch (err) {
      logger.error('Mission suggest failed', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to suggest mission' });
    }
  },
);

/**
 * POST /api/missions/generate — dev-only manual trigger.
 */
router.post(
  '/generate',
  validateBody(generateMissionDevSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    if (env.isProduction) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const { childId, triggerType, score, category } = req.body as {
      childId: string;
      triggerType: string;
      score: number;
      category?: string;
    };

    try {
      let result;
      if (triggerType === 'risky_content') {
        result = await generateMissionFromRisk(childId, score, category ?? 'adult');
      } else if (triggerType === 'low_wellbeing') {
        result = await generateMissionFromLowWellbeing(childId, score);
      } else if (triggerType === 'high_addiction') {
        result = await generateMissionFromHighAddiction(childId, score);
      } else {
        result = await generateMissionFromRisk(childId, score, category ?? 'neutral');
      }
      res.json(result);
    } catch (err) {
      logger.error('Dev mission generate failed', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to generate mission' });
    }
  },
);

/**
 * GET /api/missions/child/:childId/points
 */
router.get(
  '/child/:childId/points',
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    if (!assertChildAccess(req, childId, res)) {
      return;
    }

    try {
      const totalPoints = await getChildPoints(childId);
      res.json({ childId, totalPoints });
    } catch (err) {
      logger.error('Failed to fetch child points', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch points' });
    }
  },
);

/**
 * GET /api/missions/child/:childId
 */
router.get(
  '/child/:childId',
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    if (!assertChildAccess(req, childId, res)) {
      return;
    }

    try {
      await expireStaleMissions(childId);

      const { rows } = await query<MissionRow>(
        `SELECT id, child_id, title, description, points, status, trigger_reason,
                metadata, expires_at, created_at, completed_at
         FROM missions
         WHERE child_id = $1
         ORDER BY created_at DESC`,
        [childId],
      );

      const pending = rows.filter((r) => r.status === 'pending').map(mapMission);
      const completed = rows.filter((r) => r.status === 'completed').map(mapMission);
      const expired = rows.filter((r) => r.status === 'expired').map(mapMission);

      res.json({ childId, pending, completed, expired });
    } catch (err) {
      logger.error('Failed to list missions', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch missions' });
    }
  },
);

/**
 * POST /api/missions/:missionId/complete
 */
router.post(
  '/:missionId/complete',
  requireChildRole,
  validateBody(completeMissionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { missionId } = req.params;
    const payload = req.body as MissionCompletionPayload;

    try {
      const { rows } = await query<MissionRow>(
        `SELECT id, child_id, title, description, points, status, trigger_reason,
                metadata, expires_at, created_at, completed_at
         FROM missions
         WHERE id = $1 AND child_id = $2
         LIMIT 1`,
        [missionId, childId],
      );

      const mission = rows[0];
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }

      if (mission.status === 'completed') {
        res.status(409).json({ error: 'Mission already completed' });
        return;
      }

      if (mission.status === 'expired' || new Date(mission.expires_at) <= new Date()) {
        await query(
          `UPDATE missions SET status = 'expired' WHERE id = $1 AND status = 'pending'`,
          [missionId],
        );
        res.status(410).json({ error: 'Mission expired' });
        return;
      }

      const metadata = (mission.metadata ?? {}) as Record<string, unknown>;
      const missionType = String(metadata.type ?? 'real_world');
      const evaluation = evaluateMissionCompletion(
        missionType,
        metadata,
        mission.points,
        payload,
      );

      if (!evaluation.success) {
        res.status(400).json({
          error: evaluation.error ?? 'Mission completion validation failed',
          pointsAwarded: 0,
        });
        return;
      }

      const updatedMetadata = {
        ...metadata,
        completionData: evaluation.completionData,
      };

      await query(
        `UPDATE missions
         SET status = 'completed',
             completed_at = NOW(),
             metadata = $2::jsonb
         WHERE id = $1`,
        [missionId, JSON.stringify(updatedMetadata)],
      );

      await addPoints(childId, evaluation.pointsAwarded);
      const newBadges = await checkAndAwardBadges(childId);
      const totalPoints = await getChildPoints(childId);
      const badges = await getChildBadges(childId);

      res.json({
        points: evaluation.pointsAwarded,
        totalPoints,
        newBadges,
        badges: badges.map((b) => ({
          id: b.id,
          name: b.name,
          icon: b.icon,
          earnedAt: b.earned_at,
        })),
      });
    } catch (err) {
      logger.error('Mission complete failed', {
        childId,
        missionId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to complete mission' });
    }
  },
);

export default router;
