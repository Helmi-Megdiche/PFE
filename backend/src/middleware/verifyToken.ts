import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import type { AuthenticatedRequest, JwtPayload } from './auth';

function isValidPayload(decoded: unknown): decoded is JwtPayload {
  if (!decoded || typeof decoded !== 'object') return false;
  const p = decoded as Record<string, unknown>;
  return (
    typeof p.sub === 'string' &&
    (p.role === 'parent' || p.role === 'child') &&
    (p.childId === undefined || typeof p.childId === 'string')
  );
}

/**
 * Verifies JWT from `Authorization: Bearer <token>`.
 * Rejects requests without a valid token (401).
 */
export function verifyToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;

  if (!header) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization must use Bearer scheme' });
    return;
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Bearer token is empty' });
    return;
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret, {
      issuer: env.jwtIssuer,
      algorithms: ['HS256'],
    });

    if (!isValidPayload(decoded)) {
      logger.warn('JWT payload missing required claims', { sub: (decoded as JwtPayload)?.sub });
      res.status(401).json({ error: 'Invalid token payload' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('JWT verification failed', { err: message });
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
