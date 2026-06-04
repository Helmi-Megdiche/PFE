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
  deductPoints,
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
  penalty_applied: number | null;
  escaped_at: string | null;
}

const MISSION_SELECT = `id, child_id, title, description, points, status, trigger_reason,
  metadata, expires_at, created_at, completed_at, penalty_applied, escaped_at`;

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
    penaltyApplied: row.penalty_applied ?? 0,
    escapedAt: row.escaped_at,
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
        `SELECT ${MISSION_SELECT}
         FROM missions
         WHERE child_id = $1
         ORDER BY created_at DESC`,
        [childId],
      );

      const pending = rows.filter((r) => r.status === 'pending').map(mapMission);
      const pendingApproval = rows
        .filter((r) => r.status === 'pending_approval')
        .map(mapMission);
      const completed = rows.filter((r) => r.status === 'completed').map(mapMission);
      const expired = rows.filter((r) => r.status === 'expired').map(mapMission);
      const failed = rows.filter((r) => r.status === 'failed').map(mapMission);

      res.json({ childId, pending, pendingApproval, completed, expired, failed });
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
 * POST /api/missions/:missionId/approve — parent approves real-world mission
 */
router.post(
  '/:missionId/approve',
  requireParentRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const { missionId } = req.params;

    try {
      const { rows } = await query<MissionRow>(
        `SELECT ${MISSION_SELECT} FROM missions WHERE id = $1 LIMIT 1`,
        [missionId],
      );
      const mission = rows[0];
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      if (!assertChildAccess(req, mission.child_id, res)) {
        return;
      }
      if (mission.status !== 'pending_approval') {
        res.status(400).json({ error: 'Mission is not awaiting approval' });
        return;
      }

      await query(
        `UPDATE missions
         SET status = 'completed', completed_at = NOW()
         WHERE id = $1`,
        [missionId],
      );
      await addPoints(mission.child_id, mission.points);
      const newBadges = await checkAndAwardBadges(mission.child_id);
      const totalPoints = await getChildPoints(mission.child_id);

      res.json({ success: true, totalPoints, newBadges });
    } catch (err) {
      logger.error('Mission approve failed', {
        missionId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to approve mission' });
    }
  },
);

/**
 * POST /api/missions/:missionId/reject — parent rejects real-world mission
 */
router.post(
  '/:missionId/reject',
  requireParentRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const { missionId } = req.params;

    try {
      const { rows } = await query<MissionRow>(
        `SELECT ${MISSION_SELECT} FROM missions WHERE id = $1 LIMIT 1`,
        [missionId],
      );
      const mission = rows[0];
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      if (!assertChildAccess(req, mission.child_id, res)) {
        return;
      }
      if (mission.status !== 'pending_approval') {
        res.status(400).json({ error: 'Mission is not awaiting approval' });
        return;
      }

      await query(
        `UPDATE missions SET status = 'expired' WHERE id = $1`,
        [missionId],
      );
      res.json({ success: true });
    } catch (err) {
      logger.error('Mission reject failed', {
        missionId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to reject mission' });
    }
  },
);

const ESCAPE_PENALTY = 10;

/**
 * GET /api/missions/:missionId — child fetches a single mission (e.g. verify notification launch).
 */
router.get(
  '/:missionId',
  requireChildRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { missionId } = req.params;

    try {
      const { rows } = await query<MissionRow>(
        `SELECT ${MISSION_SELECT}
         FROM missions WHERE id = $1 AND child_id = $2 LIMIT 1`,
        [missionId, childId],
      );
      const mission = rows[0];
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      res.json(mapMission(mission));
    } catch (err) {
      logger.error('Mission fetch failed', {
        childId,
        missionId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch mission' });
    }
  },
);

/**
 * POST /api/missions/:missionId/abandon — child escaped active mission
 */
router.post(
  '/:missionId/abandon',
  requireChildRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { missionId } = req.params;

    try {
      const { rows } = await query<MissionRow>(
        `SELECT ${MISSION_SELECT}
         FROM missions WHERE id = $1 AND child_id = $2 LIMIT 1`,
        [missionId, childId],
      );
      const mission = rows[0];
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      if (mission.status !== 'pending') {
        res.status(400).json({ error: 'Only active pending missions can be abandoned' });
        return;
      }

      await query(
        `UPDATE missions
         SET status = 'failed',
             escaped_at = NOW(),
             penalty_applied = $2
         WHERE id = $1`,
        [missionId, ESCAPE_PENALTY],
      );
      const totalPoints = await deductPoints(childId, ESCAPE_PENALTY);

      res.json({ success: true, penalty: ESCAPE_PENALTY, totalPoints });
    } catch (err) {
      logger.error('Mission abandon failed', {
        childId,
        missionId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to abandon mission' });
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
        `SELECT ${MISSION_SELECT}
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

      if (mission.status === 'completed' || mission.status === 'pending_approval') {
        res.status(409).json({ error: 'Mission already completed or awaiting approval' });
        return;
      }

      if (
        mission.status === 'expired' ||
        mission.status === 'failed' ||
        new Date(mission.expires_at) <= new Date()
      ) {
        await query(
          `UPDATE missions SET status = 'expired'
           WHERE id = $1 AND status IN ('pending', 'pending_approval')`,
          [missionId],
        );
        res.status(410).json({ error: 'Mission expired' });
        return;
      }

      if (mission.status !== 'pending') {
        res.status(400).json({ error: 'Mission cannot be completed in current state' });
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

      if (missionType === 'real_world') {
        await query(
          `UPDATE missions
           SET status = 'pending_approval',
               metadata = $2::jsonb
           WHERE id = $1`,
          [missionId, JSON.stringify(updatedMetadata)],
        );
        const totalPoints = await getChildPoints(childId);
        res.json({
          status: 'pending_approval',
          pointsAwarded: 0,
          totalPoints,
          message: 'Waiting for parent approval',
        });
        return;
      }

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
        status: 'completed',
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
