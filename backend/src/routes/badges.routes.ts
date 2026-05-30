import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { validateQuery } from '../middleware/validate';
import Joi from 'joi';
import {
  getChildBadges,
  listAllBadgesWithEarnedStatus,
} from '../services/gamificationService';
import { logger } from '../utils/logger';

const router = Router();

const listBadgesQuerySchema = Joi.object({
  childId: Joi.string().uuid().optional(),
});

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
 * GET /api/badges?childId=
 */
router.get(
  '/',
  validateQuery(listBadgesQuerySchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.query as { childId?: string };

    if (childId && !assertChildAccess(req, childId, res)) {
      return;
    }

    try {
      const badges = await listAllBadgesWithEarnedStatus(childId);
      res.json({
        badges: badges.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          icon: b.icon,
          requirementType: b.requirement_type,
          requirementValue: b.requirement_value,
          pointsAwarded: b.points_awarded,
          earned: b.earned,
          earnedAt: b.earnedAt,
        })),
      });
    } catch (err) {
      logger.error('Failed to list badges', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch badges' });
    }
  },
);

/**
 * GET /api/badges/child/:childId
 */
router.get(
  '/child/:childId',
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    if (!assertChildAccess(req, childId, res)) {
      return;
    }

    try {
      const badges = await getChildBadges(childId);
      res.json({
        childId,
        badges: badges.map((b) => ({
          id: b.id,
          name: b.name,
          description: b.description,
          icon: b.icon,
          requirementType: b.requirement_type,
          requirementValue: b.requirement_value,
          pointsAwarded: b.points_awarded,
          earnedAt: b.earned_at,
        })),
      });
    } catch (err) {
      logger.error('Failed to fetch child badges', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch child badges' });
    }
  },
);

export default router;
