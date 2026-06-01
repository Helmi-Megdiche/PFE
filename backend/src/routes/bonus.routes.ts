import { Router, Response } from 'express';
import {
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { bonusPointsSchema } from '../validators/bonus.validator';
import { query } from '../db/pool';
import { logger } from '../utils/logger';
import { addPoints, getChildPoints } from '../services/gamificationService';

const router = Router();

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
 * POST /api/bonus/child/:childId
 */
router.post(
  '/child/:childId',
  requireParentRole,
  validateBody(bonusPointsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    if (!assertChildAccess(req, childId, res)) {
      return;
    }

    const { points, reason } = req.body as { points: number; reason?: string };

    try {
      await addPoints(childId, points);
      const reasonText = reason?.trim() || 'Parent gave bonus points';
      await query(
        `INSERT INTO missions (
          child_id, title, description, points, status, trigger_reason, metadata, completed_at
        ) VALUES ($1, $2, $3, $4, 'completed', 'bonus', $5::jsonb, NOW())`,
        [
          childId,
          'Bonus Points',
          reasonText,
          points,
          JSON.stringify({ bonus: true, reason: reasonText }),
        ],
      );
      const totalPoints = await getChildPoints(childId);
      res.json({ success: true, totalPoints });
    } catch (err) {
      logger.error('Bonus points failed', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to award bonus points' });
    }
  },
);

export default router;
