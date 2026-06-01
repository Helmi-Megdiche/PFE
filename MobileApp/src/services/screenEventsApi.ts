import { api } from './apiClient';
import type { NewMissionSnapshot } from './missionsApi';
import type { ScreenEventPayload } from '../types/screenMonitor';

export interface ScreenEventResponse {
  id: string;
  childId: string;
  timestamp: string;
  appPackage: string;
  extractedTextPreview: string;
  riskFlag: boolean;
  riskScore: number | null;
  imageRiskScore: number | null;
  imageClassificationDetails: Record<string, unknown> | null;
  combinedRiskScore: number | null;
  category: string | null;
  createdAt: string;
  newMission: NewMissionSnapshot | null;
  missionGeneration?: { created: boolean; reason?: string } | null;
}

/** POST /api/screen-events — Bearer JWT attached by apiClient. */
export function postScreenEvent(payload: ScreenEventPayload): Promise<ScreenEventResponse> {
  return api.post<ScreenEventResponse>('/screen-events', payload);
}
