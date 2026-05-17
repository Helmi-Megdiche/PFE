import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const router = Router();

/** Fixed IDs from 002_dev_seed.sql */
const DEV_CHILD_USER_ID = '22222222-2222-2222-2222-222222222222';
const DEV_CHILD_ID = '33333333-3333-3333-3333-333333333333';

/**
 * GET /api/dev/child-token
 * Development only — returns a JWT for the seeded test child.
 */
router.get('/child-token', (_req, res) => {
  if (env.isProduction) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const token = jwt.sign(
    {
      sub: DEV_CHILD_USER_ID,
      role: 'child',
      childId: DEV_CHILD_ID,
    },
    env.jwtSecret,
    {
      issuer: env.jwtIssuer,
      algorithm: 'HS256',
      expiresIn: '7d',
    },
  );

  res.json({
    token,
    childId: DEV_CHILD_ID,
    expiresIn: '7d',
  });
});

export default router;
