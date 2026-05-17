import { api } from './apiClient';

/** Sprint 2 — GET /api/scores/:childId?date=YYYY-MM-DD */
export interface DailyScoresResponse {
  childId: string;
  date: string;
  addictionScore: number;
  wellbeingScore: number;
  components?: {
    addiction: Record<string, number | null>;
    wellbeing: Record<string, number | null>;
  };
}

export interface ScoreTrendResponse {
  childId: string;
  days: number;
  scores: DailyScoresResponse[];
}

export function getDailyScores(
  childId: string,
  date?: string,
): Promise<DailyScoresResponse> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return api.get<DailyScoresResponse>(`/scores/${childId}${query}`);
}

export function getScoreTrend(
  childId: string,
  days = 7,
): Promise<ScoreTrendResponse> {
  return api.get<ScoreTrendResponse>(
    `/scores/${childId}/trend?days=${days}`,
  );
}
