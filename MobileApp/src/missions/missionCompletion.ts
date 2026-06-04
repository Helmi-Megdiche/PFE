import {
  abandonMission,
  completeMission,
  type MissionCompletionPayload,
} from '../services/missionsApi';

export interface MissionCompletionResult {
  kind: 'completed' | 'abandoned' | 'pending_approval';
  message: string;
  totalPoints?: number;
  penalty?: number;
}

export async function executeMissionAction(
  missionId: string,
  missionType: string,
  metadata: Record<string, unknown>,
  action: 'complete' | 'abandon',
): Promise<MissionCompletionResult> {
  if (action === 'abandon') {
    const res = await abandonMission(missionId);
    return {
      kind: 'abandoned',
      message: `Escape penalty: -${res.penalty} points. Total: ${res.totalPoints}`,
      totalPoints: res.totalPoints,
      penalty: res.penalty,
    };
  }

  const body = buildCompletionPayload(missionType, metadata);
  const res = await completeMission(missionId, body);
  const points = res.points ?? res.pointsAwarded ?? 0;
  if (res.status === 'pending_approval') {
    return {
      kind: 'pending_approval',
      message: res.message ?? 'Waiting for parent approval',
      totalPoints: res.totalPoints,
    };
  }
  return {
    kind: 'completed',
    message: `+${points} points! Total: ${res.totalPoints}`,
    totalPoints: res.totalPoints,
  };
}

function buildCompletionPayload(
  missionType: string,
  metadata: Record<string, unknown>,
): MissionCompletionPayload {
  switch (missionType) {
    case 'real_world':
      return { confirmed: true };
    case 'quiz': {
      const submitted = metadata.submittedAnswers as string[] | undefined;
      if (Array.isArray(submitted) && submitted.length > 0) {
        return { answers: submitted };
      }
      const fromMeta = metadata.answers as string[] | undefined;
      if (Array.isArray(fromMeta) && fromMeta.length > 0) {
        return { answers: fromMeta };
      }
      return { answers: [] };
    }
    case 'cognitive': {
      const exercise = String(metadata.exercise ?? 'nback');
      if (exercise === 'reaction') {
        return { reactionTimeMs: 250 };
      }
      if (exercise === 'hanoi') {
        return { moves: 7 };
      }
      return { exerciseScore: 100 };
    }
    case 'minigame':
      return { won: true };
    default:
      return { confirmed: true };
  }
}
