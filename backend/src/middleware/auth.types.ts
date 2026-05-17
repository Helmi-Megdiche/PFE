import { Request } from 'express';

export interface JwtPayload {
  sub: string;
  role: 'parent' | 'child';
  childId?: string;
  iat?: number;
  exp?: number;
}

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}
