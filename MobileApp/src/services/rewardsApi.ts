import { api } from './apiClient';

export interface RewardDto {
  id: string;
  title: string;
  description: string;
  pointsRequired: number;
  isClaimed: boolean;
}

export function listRewards(): Promise<{ rewards: RewardDto[] }> {
  return api.get<{ rewards: RewardDto[] }>('/rewards');
}

export function claimReward(rewardId: string): Promise<{ totalPoints: number }> {
  return api.post(`/rewards/${rewardId}/claim`, {});
}
