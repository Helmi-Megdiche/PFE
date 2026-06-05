import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import {
  checkAndAwardBadges,
  revokeMismatchedAgeBadges,
} from '../services/gamificationService';

const router = Router();

/** Fixed IDs from 002_dev_seed.sql */
const DEV_PARENT_USER_ID = '11111111-1111-1111-1111-111111111111';
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

/**
 * GET /api/dev/parent-token
 * Development only — JWT for seeded test parent (dashboard / score APIs).
 */
router.get('/parent-token', (_req, res) => {
  if (env.isProduction) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const token = jwt.sign(
    { sub: DEV_PARENT_USER_ID, role: 'parent' },
    env.jwtSecret,
    { issuer: env.jwtIssuer, algorithm: 'HS256', expiresIn: '7d' },
  );

  res.json({ token, expiresIn: '7d' });
});

/**
 * POST /api/dev/reward-age-badges/:childId
 * Development only — re-run badge eligibility (e.g. after birth year change).
 */
router.post('/reward-age-badges/:childId', async (req, res) => {
  if (env.isProduction) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const { childId } = req.params;
  try {
    const revokedBadges = await revokeMismatchedAgeBadges(childId);
    const newBadges = await checkAndAwardBadges(childId);
    res.json({ success: true, childId, revokedBadges, newBadges });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to award badges',
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});

export default router;
