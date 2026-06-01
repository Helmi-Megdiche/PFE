import { Router, Response } from 'express';
import {
  requireParentRole,
  AuthenticatedRequest,
} from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { customMissionSchema } from '../validators/customMissions.validator';
import {
  createCustomMission,
  deleteCustomMission,
  listCustomMissions,
  updateCustomMission,
  type CustomMissionRow,
} from '../services/customMissionService';
import { logger } from '../utils/logger';

const router = Router();

router.use(requireParentRole);

function mapCustomMission(row: CustomMissionRow) {
  return {
    id: row.id,
    parentId: row.parent_id,
    title: row.title,
    description: row.description,
    points: row.points,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/custom-missions — list parent custom missions
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const missions = await listCustomMissions(req.user!.sub);
    res.json({ missions: missions.map(mapCustomMission) });
  } catch (err) {
    logger.error('Failed to list custom missions', {
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Failed to list custom missions' });
  }
});

/**
 * POST /api/custom-missions — create custom mission
 */
router.post(
  '/',
  validateBody(customMissionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { title, description, points } = req.body as {
      title: string;
      description: string;
      points: number;
    };

    try {
      const mission = await createCustomMission(
        req.user!.sub,
        title,
        description,
        points,
      );
      res.status(201).json(mapCustomMission(mission));
    } catch (err) {
      logger.error('Failed to create custom mission', {
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to create custom mission' });
    }
  },
);

/**
 * PUT /api/custom-missions/:id — update custom mission
 */
router.put(
  '/:id',
  validateBody(customMissionSchema),
  async (req: AuthenticatedRequest, res: Response) => {
    const { id } = req.params;
    const { title, description, points } = req.body as {
      title: string;
      description: string;
      points: number;
    };

    try {
      const mission = await updateCustomMission(
        id,
        req.user!.sub,
        title,
        description,
        points,
      );
      if (!mission) {
        res.status(404).json({ error: 'Mission not found' });
        return;
      }
      res.json(mapCustomMission(mission));
    } catch (err) {
      logger.error('Failed to update custom mission', {
        missionId: id,
        err: err instanceof Error ? err.message : String(err),
      });
      res.status(500).json({ error: 'Failed to update custom mission' });
    }
  },
);

/**
 * DELETE /api/custom-missions/:id
 */
router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  try {
    const deleted = await deleteCustomMission(id, req.user!.sub);
    if (!deleted) {
      res.status(404).json({ error: 'Mission not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error('Failed to delete custom mission', {
      missionId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: 'Failed to delete custom mission' });
  }
});

export default router;
