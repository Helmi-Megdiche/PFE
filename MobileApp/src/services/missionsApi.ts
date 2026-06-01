import { api } from './apiClient';

export interface MissionDto {
  id: string;
  childId: string;
  title: string;
  description: string;
  points: number;
  status: string;
  triggerReason: string | null;
  metadata: Record<string, unknown> | null;
  expiresAt: string;
  createdAt: string;
  completedAt: string | null;
  penaltyApplied?: number;
  escapedAt?: string | null;
}

export interface MissionsListResponse {
  childId: string;
  pending: MissionDto[];
  pendingApproval: MissionDto[];
  completed: MissionDto[];
  expired: MissionDto[];
  failed: MissionDto[];
}

export interface MissionCompletionPayload {
  exerciseScore?: number;
  reactionTimeMs?: number;
  moves?: number;
  answers?: string[];
  won?: boolean;
  completed?: boolean;
  confirmed?: boolean;
}

export interface CompleteMissionResponse {
  status?: string;
  points?: number;
  pointsAwarded?: number;
  totalPoints: number;
  message?: string;
  newBadges?: string[];
}

export interface NewMissionSnapshot {
  id: string;
  title: string;
  description: string;
  points: number;
  status: string;
  type: string;
  metadata: Record<string, unknown>;
}

export function getMissions(childId: string): Promise<MissionsListResponse> {
  return api.get<MissionsListResponse>(`/missions/child/${childId}`);
}

export function getChildPoints(childId: string): Promise<{ childId: string; totalPoints: number }> {
  return api.get(`/missions/child/${childId}/points`);
}

export function suggestMission(payload: {
  category: string;
  textSnippet: string;
}): Promise<{ id: string | null; created?: boolean }> {
  return api.post('/missions/suggest', payload);
}

export function completeMission(
  missionId: string,
  body: MissionCompletionPayload,
): Promise<CompleteMissionResponse> {
  return api.post<CompleteMissionResponse>(`/missions/${missionId}/complete`, body);
}

export function abandonMission(missionId: string): Promise<{
  success: boolean;
  penalty: number;
  totalPoints: number;
}> {
  return api.post(`/missions/${missionId}/abandon`, {});
}
