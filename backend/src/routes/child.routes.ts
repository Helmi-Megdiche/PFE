import { Router, Response } from 'express';
import {
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  updateChildInterestsSchema,
  updateChildProfileSchema,
} from '../validators/child.validator';
import {
  checkAndAwardBadges,
  revokeMismatchedAgeBadges,
} from '../services/gamificationService';
import { query } from '../db/pool';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireParentRole);

async function assertParentOwnsChild(
  parentId: string,
  childId: string,
): Promise<boolean> {
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM children WHERE id = $1 AND parent_id = $2 LIMIT 1`,
    [childId, parentId],
  );
  return rows.length > 0;
}

function normalizeInterests(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === 'string');
}

/**
 * GET /api/child/profile/:childId
 */
router.get(
  '/profile/:childId',
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const parentId = req.user!.sub;

    try {
      if (!(await assertParentOwnsChild(parentId, childId))) {
        res.status(403).json({ error: 'Access denied for this child' });
        return;
      }

      const { rows } = await query<{
        display_name: string;
        birth_year: number | null;
      }>(
        `SELECT display_name, birth_year FROM children WHERE id = $1`,
        [childId],
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'Child not found' });
        return;
      }

      res.json({
        childId,
        displayName: rows[0].display_name,
        birthYear: rows[0].birth_year,
      });
    } catch (err) {
      logger.error('Failed to fetch child profile', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch child profile' });
    }
  },
);

/**
 * PUT /api/child/profile
 */
router.put(
  '/profile',
  validateBody(updateChildProfileSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId, birthYear } = req.body as {
      childId: string;
      birthYear: number;
    };
    const parentId = req.user!.sub;

    try {
      if (!(await assertParentOwnsChild(parentId, childId))) {
        res.status(403).json({ error: 'Access denied for this child' });
        return;
      }

      const { rows } = await query<{
        display_name: string;
        birth_year: number | null;
      }>(
        `UPDATE children
         SET birth_year = $1
         WHERE id = $2 AND parent_id = $3
         RETURNING display_name, birth_year`,
        [birthYear, childId, parentId],
      );
      if (!rows[0]) {
        res.status(404).json({ error: 'Child not found' });
        return;
      }

      const revokedBadges = await revokeMismatchedAgeBadges(childId);
      const newBadges = await checkAndAwardBadges(childId);

      res.json({
        success: true,
        childId,
        displayName: rows[0].display_name,
        birthYear: rows[0].birth_year,
        revokedBadges,
        newBadges,
      });
    } catch (err) {
      logger.error('Failed to update child profile', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to update child profile' });
    }
  },
);

/**
 * GET /api/child/interests/:childId
 */
router.get(
  '/interests/:childId',
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId } = req.params;
    const parentId = req.user!.sub;

    try {
      if (!(await assertParentOwnsChild(parentId, childId))) {
        res.status(403).json({ error: 'Access denied for this child' });
        return;
      }

      const { rows } = await query<{ interests: unknown }>(
        `SELECT interests FROM children WHERE id = $1`,
        [childId],
      );
      const interests = normalizeInterests(rows[0]?.interests);
      res.json({ childId, interests });
    } catch (err) {
      logger.error('Failed to fetch child interests', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to fetch child interests' });
    }
  },
);

/**
 * PUT /api/child/interests
 */
router.put(
  '/interests',
  validateBody(updateChildInterestsSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { childId, interests } = req.body as {
      childId: string;
      interests: string[];
    };
    const parentId = req.user!.sub;

    try {
      if (!(await assertParentOwnsChild(parentId, childId))) {
        res.status(403).json({ error: 'Access denied for this child' });
        return;
      }

      await query(
        `UPDATE children SET interests = $1::jsonb WHERE id = $2 AND parent_id = $3`,
        [JSON.stringify(interests), childId, parentId],
      );
      res.json({ success: true, childId, interests });
    } catch (err) {
      logger.error('Failed to update child interests', {
        childId,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to update child interests' });
    }
  },
);

export default router;
