import { api } from './apiClient';

export interface BadgeDto {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  earned: boolean;
  earnedAt?: string;
  category?: string;
  requirementType?: string | null;
  requirementValue?: number | null;
  requirementConfig?: Record<string, unknown> | null;
  pointsAwarded?: number | null;
}

export function listBadges(childId: string): Promise<{ badges: BadgeDto[] }> {
  return api.get<{ badges: BadgeDto[] }>(`/badges?childId=${encodeURIComponent(childId)}`);
}

export function getChildBadges(childId: string): Promise<{ badges: BadgeDto[] }> {
  return api.get<{ badges: BadgeDto[] }>(`/badges/child/${childId}`);
}
