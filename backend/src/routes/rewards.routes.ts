import { Router, Response } from 'express';
import {
  requireChildRole,
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  createRewardSchema,
  updateRewardSchema,
} from '../validators/rewards.validator';
import { query } from '../db/pool';
import { logger } from '../utils/logger';
import { getChildPoints } from '../services/gamificationService';
import { getChildParentId } from '../services/missionHelpers';

const router = Router();

interface RewardRow {
  id: string;
  parent_id: string;
  title: string;
  description: string;
  points_required: number;
  is_claimed: boolean;
  claimed_by_child_id: string | null;
  claimed_at: string | null;
  created_at: string;
}

function mapReward(row: RewardRow) {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    pointsRequired: row.points_required,
    isClaimed: row.is_claimed,
    claimedByChildId: row.claimed_by_child_id,
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/rewards
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.role === 'parent') {
      const { rows } = await query<RewardRow>(
        `SELECT id, parent_id, title, description, points_required, is_claimed,
                claimed_by_child_id, claimed_at, created_at
         FROM rewards
         WHERE parent_id = $1
         ORDER BY created_at DESC`,
        [req.user.sub],
      );
      res.json({ rewards: rows.map(mapReward) });
      return;
    }

    if (req.user?.role === 'child' && req.user.childId) {
      const parentId = await getChildParentId(req.user.childId);
      if (!parentId) {
        res.status(404).json({ error: 'Child profile not found' });
        return;
      }

      const { rows } = await query<RewardRow>(
        `SELECT id, parent_id, title, description, points_required, is_claimed,
                claimed_by_child_id, claimed_at, created_at
         FROM rewards
         WHERE parent_id = $1 AND is_claimed = FALSE
         ORDER BY points_required ASC`,
        [parentId],
      );
      res.json({ rewards: rows.map(mapReward) });
      return;
    }

    res.status(403).json({ error: 'Authentication required' });
  } catch (err) {
    logger.error('Failed to list rewards', {
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Failed to fetch rewards' });
  }
});

/**
 * POST /api/rewards — parent creates reward.
 */
router.post(
  '/',
  requireParentRole,
  validateBody(createRewardSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, pointsRequired } = req.body as {
      title: string;
      description: string;
      pointsRequired: number;
    };

    try {
      const { rows } = await query<RewardRow>(
        `INSERT INTO rewards (parent_id, title, description, points_required)
         VALUES ($1, $2, $3, $4)
         RETURNING id, parent_id, title, description, points_required, is_claimed,
                   claimed_by_child_id, claimed_at, created_at`,
        [req.user!.sub, title, description, pointsRequired],
      );
      res.status(201).json(mapReward(rows[0]));
    } catch (err) {
      logger.error('Failed to create reward', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to create reward' });
    }
  },
);

/**
 * PUT /api/rewards/:rewardId
 */
router.put(
  '/:rewardId',
  requireParentRole,
  validateBody(updateRewardSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { rewardId } = req.params;
    const updates = req.body as Partial<{
      title: string;
      description: string;
      pointsRequired: number;
    }>;

    try {
      const { rows: existing } = await query<RewardRow>(
        `SELECT id, parent_id, title, description, points_required, is_claimed,
                claimed_by_child_id, claimed_at, created_at
         FROM rewards WHERE id = $1 LIMIT 1`,
        [rewardId],
      );
      const reward = existing[0];
      if (!reward || reward.parent_id !== req.user!.sub) {
        res.status(404).json({ error: 'Reward not found' });
        return;
      }
      if (reward.is_claimed) {
        res.status(409).json({ error: 'Cannot edit a claimed reward' });
        return;
      }

      const { rows } = await query<RewardRow>(
        `UPDATE rewards
         SET title = COALESCE($2, title),
             description = COALESCE($3, description),
             points_required = COALESCE($4, points_required)
         WHERE id = $1
         RETURNING id, parent_id, title, description, points_required, is_claimed,
                   claimed_by_child_id, claimed_at, created_at`,
        [
          rewardId,
          updates.title ?? null,
          updates.description ?? null,
          updates.pointsRequired ?? null,
        ],
      );
      res.json(mapReward(rows[0]));
    } catch (err) {
      logger.error('Failed to update reward', {
        rewardId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to update reward' });
    }
  },
);

/**
 * DELETE /api/rewards/:rewardId
 */
router.delete(
  '/:rewardId',
  requireParentRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const { rewardId } = req.params;

    try {
      const { rows } = await query<{ parent_id: string; is_claimed: boolean }>(
        `SELECT parent_id, is_claimed FROM rewards WHERE id = $1 LIMIT 1`,
        [rewardId],
      );
      const reward = rows[0];
      if (!reward || reward.parent_id !== req.user!.sub) {
        res.status(404).json({ error: 'Reward not found' });
        return;
      }
      if (reward.is_claimed) {
        res.status(409).json({ error: 'Cannot delete a claimed reward' });
        return;
      }

      await query(`DELETE FROM rewards WHERE id = $1`, [rewardId]);
      res.status(204).send();
    } catch (err) {
      logger.error('Failed to delete reward', {
        rewardId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to delete reward' });
    }
  },
);

/**
 * POST /api/rewards/:rewardId/claim — child claims reward.
 */
router.post(
  '/:rewardId/claim',
  requireChildRole,
  async (req: AuthenticatedRequest, res: Response) => {
    const childId = req.user!.childId!;
    const { rewardId } = req.params;

    try {
      const parentId = await getChildParentId(childId);
      if (!parentId) {
        res.status(404).json({ error: 'Child profile not found' });
        return;
      }

      const { rows } = await query<RewardRow>(
        `SELECT id, parent_id, title, description, points_required, is_claimed,
                claimed_by_child_id, claimed_at, created_at
         FROM rewards
         WHERE id = $1 AND parent_id = $2
         LIMIT 1`,
        [rewardId, parentId],
      );
      const reward = rows[0];
      if (!reward) {
        res.status(404).json({ error: 'Reward not found' });
        return;
      }
      if (reward.is_claimed) {
        res.status(409).json({ error: 'Reward already claimed' });
        return;
      }

      const totalPoints = await getChildPoints(childId);
      if (totalPoints < reward.points_required) {
        res.status(400).json({
          error: 'Insufficient points',
          totalPoints,
          pointsRequired: reward.points_required,
        });
        return;
      }

      await query(
        `UPDATE child_points
         SET total_points = total_points - $2,
             updated_at = NOW()
         WHERE child_id = $1`,
        [childId, reward.points_required],
      );

      await query(
        `UPDATE rewards
         SET is_claimed = TRUE,
             claimed_by_child_id = $2,
             claimed_at = NOW()
         WHERE id = $1`,
        [rewardId, childId],
      );

      const remainingPoints = await getChildPoints(childId);
      res.json({
        rewardId,
        pointsSpent: reward.points_required,
        totalPoints: remainingPoints,
      });
    } catch (err) {
      logger.error('Failed to claim reward', {
        childId,
        rewardId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to claim reward' });
    }
  },
);

export default router;
