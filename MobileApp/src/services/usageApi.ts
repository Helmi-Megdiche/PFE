import {api} from './apiClient';

/** Sprint 2 — POST /api/usage batch sessions. */
export interface UsageSessionPayload {
  startTime: string;
  endTime: string;
  appPackage: string;
  appCategory?: string;
}

export interface PostUsageResponse {
  count: number;
}

export function postUsageSessions(
  sessions: UsageSessionPayload[],
): Promise<PostUsageResponse> {
  return api.post<PostUsageResponse>('/usage', {sessions});
}

/** Sprint 2 — GET /api/usage/:childId?date=YYYY-MM-DD (parent JWT). */
export interface UsageSessionDto {
  id: string;
  startTime: string;
  endTime: string;
  appPackage: string;
  appCategory: string;
  createdAt: string;
}

export function getUsageSessions(
  childId: string,
  date?: string,
): Promise<{childId: string; date: string; sessions: UsageSessionDto[]}> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return api.get(`/usage/${childId}${query}`);
}
