import { api } from './apiClient';

/** Sprint 3 — POST /api/missions/suggest */
export interface MissionSuggestPayload {
  category: string;
  textSnippet: string;
}

export function suggestMission(payload: MissionSuggestPayload): Promise<{ id: string }> {
  return api.post<{ id: string }>('/missions/suggest', payload);
}

/** Sprint 3 — POST /api/missions/:id/complete */
export function completeMission(missionId: string): Promise<{ points: number }> {
  return api.post<{ points: number }>(`/missions/${missionId}/complete`, {});
}
