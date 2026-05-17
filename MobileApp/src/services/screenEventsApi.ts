import { api } from './apiClient';
import type { ScreenEventPayload } from '../types/screenMonitor';

export interface ScreenEventResponse {
  id: string;
  childId: string;
  timestamp: string;
  appPackage: string;
  extractedTextPreview: string;
  riskFlag: boolean;
  riskScore: number | null;
  category: string | null;
  createdAt: string;
}

/** POST /api/screen-events — Bearer JWT attached by apiClient. */
export function postScreenEvent(payload: ScreenEventPayload): Promise<ScreenEventResponse> {
  return api.post<ScreenEventResponse>('/screen-events', payload);
}
