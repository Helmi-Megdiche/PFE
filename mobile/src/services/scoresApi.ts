import { api } from './apiClient';

/** Sprint 2 — GET /api/scores/:childId?date=YYYY-MM-DD */
export interface DailyScoresResponse {
  addictionRisk: number;
  wellBeing: number;
  date: string;
}

export function getDailyScores(
  childId: string,
  date: string,
): Promise<DailyScoresResponse> {
  return api.get<DailyScoresResponse>(`/scores/${childId}?date=${encodeURIComponent(date)}`);
}
