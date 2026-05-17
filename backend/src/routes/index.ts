import { Router } from 'express';
import { env } from '../config/env';
import { verifyToken } from '../middleware/verifyToken';
import screenEventsRoutes from './screenEvents.routes';
import devRoutes from './dev.routes';

const router = Router();

/** Public — no JWT (load balancer / monitoring). */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Development helpers (JWT minting) — disabled in production. */
if (!env.isProduction) {
  router.use('/dev', devRoutes);
}

/** All routes below require `Authorization: Bearer <JWT>`. */
router.use(verifyToken);

router.use('/screen-events', screenEventsRoutes);

export default router;
