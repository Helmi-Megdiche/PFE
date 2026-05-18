import { Router } from 'express';
import { env } from '../config/env';
import { verifyToken } from '../middleware/verifyToken';
import screenEventsRoutes from './screenEvents.routes';
import usageRoutes from './usage.routes';
import scoresRoutes from './scores.routes';
import devRoutes from './dev.routes';
import debugRoutes from './debug.routes';

const router = Router();

/** Public — no JWT (load balancer / monitoring). */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Development helpers (JWT minting) — disabled in production. */
if (!env.isProduction) {
  router.use('/dev', devRoutes);
  router.use('/debug', debugRoutes);
}

/** All routes below require `Authorization: Bearer <JWT>`. */
router.use(verifyToken);

router.use('/screen-events', screenEventsRoutes);
router.use('/usage', usageRoutes);
router.use('/scores', scoresRoutes);

export default router;
