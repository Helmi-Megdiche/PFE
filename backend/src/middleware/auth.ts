import { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.types';

export type { AuthenticatedRequest, JwtPayload } from './auth.types';
export { verifyToken } from './verifyToken';

/** Child app tokens must include role=child and childId. */
export function requireChildRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'child' || !req.user.childId) {
    res.status(403).json({ error: 'Child authentication required' });
    return;
  }
  next();
}

/** Parent dashboard / management endpoints. */
export function requireParentRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  if (req.user?.role !== 'parent') {
    res.status(403).json({ error: 'Parent authentication required' });
    return;
  }
  next();
}
