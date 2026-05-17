import { api } from './apiClient';

/** Sprint 2 — POST /api/usage batch sessions. */
export interface UsageSessionPayload {
  start: string;
  end: string;
  appName: string;
  category?: string;
}

export function postUsageSessions(sessions: UsageSessionPayload[]): Promise<void> {
  return api.post<void>('/usage', { sessions });
}
