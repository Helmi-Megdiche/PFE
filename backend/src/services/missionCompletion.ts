export interface MissionCompletionPayload {
  exerciseScore?: number;
  reactionTimeMs?: number;
  moves?: number;
  answers?: string[];
  won?: boolean;
  completed?: boolean;
  confirmed?: boolean;
}

export interface MissionCompletionResult {
  success: boolean;
  pointsAwarded: number;
  completionData: Record<string, unknown>;
  error?: string;
}

function minimumHanoiMoves(disks: number): number {
  return Math.pow(2, disks) - 1;
}

function scoreNback(basePoints: number, exerciseScore: number): number {
  const clamped = Math.max(0, Math.min(100, exerciseScore));
  return Math.floor((basePoints * clamped) / 100);
}

function scoreReaction(basePoints: number, reactionTimeMs: number): number {
  if (reactionTimeMs <= 300) {
    return basePoints;
  }
  if (reactionTimeMs <= 500) {
    return Math.floor(basePoints * 0.75);
  }
  return Math.floor(basePoints * 0.5);
}

function scoreHanoi(
  basePoints: number,
  moves: number,
  disks: number,
): { points: number; optimal: boolean } {
  const minMoves = minimumHanoiMoves(disks);
  if (moves <= minMoves) {
    return { points: basePoints + 10, optimal: true };
  }
  const ratio = minMoves / moves;
  return {
    points: Math.max(5, Math.floor(basePoints * ratio)),
    optimal: false,
  };
}

function scoreQuiz(
  basePoints: number,
  answers: string[],
  correctAnswers: string[],
): { points: number; passed: boolean } {
  let correct = 0;
  for (let i = 0; i < correctAnswers.length; i += 1) {
    if (answers[i] === correctAnswers[i]) {
      correct += 1;
    }
  }
  const passed = correct >= Math.ceil(correctAnswers.length * (2 / 3));
  const ratio = correct / correctAnswers.length;
  return {
    points: passed ? Math.floor(basePoints * ratio) : Math.floor(basePoints * 0.25),
    passed,
  };
}

export function evaluateMissionCompletion(
  missionType: string,
  metadata: Record<string, unknown>,
  basePoints: number,
  payload: MissionCompletionPayload,
): MissionCompletionResult {
  if (missionType === 'cognitive') {
    const exercise = metadata.exercise as string | undefined;
    if (exercise === 'nback') {
      if (payload.exerciseScore == null) {
        return {
          success: false,
          pointsAwarded: 0,
          completionData: {},
          error: 'exerciseScore required for nback',
        };
      }
      const pointsAwarded = scoreNback(basePoints, payload.exerciseScore);
      return {
        success: pointsAwarded > 0,
        pointsAwarded,
        completionData: {
          exercise: 'nback',
          exerciseScore: payload.exerciseScore,
        },
      };
    }
    if (exercise === 'reaction') {
      if (payload.reactionTimeMs == null) {
        return {
          success: false,
          pointsAwarded: 0,
          completionData: {},
          error: 'reactionTimeMs required for reaction',
        };
      }
      const pointsAwarded = scoreReaction(basePoints, payload.reactionTimeMs);
      return {
        success: true,
        pointsAwarded,
        completionData: {
          exercise: 'reaction',
          reactionTimeMs: payload.reactionTimeMs,
        },
      };
    }
    if (exercise === 'hanoi') {
      if (payload.moves == null) {
        return {
          success: false,
          pointsAwarded: 0,
          completionData: {},
          error: 'moves required for hanoi',
        };
      }
      const disks = Number(metadata.disks ?? 3);
      const { points, optimal } = scoreHanoi(basePoints, payload.moves, disks);
      return {
        success: true,
        pointsAwarded: points,
        completionData: {
          exercise: 'hanoi',
          moves: payload.moves,
          optimal,
          minMoves: minimumHanoiMoves(disks),
        },
      };
    }
  }

  if (missionType === 'quiz') {
    const correctAnswers = (metadata.correctAnswers as string[] | undefined) ?? [
      'A',
      'B',
      'A',
    ];
    if (!payload.answers || payload.answers.length === 0) {
      return {
        success: false,
        pointsAwarded: 0,
        completionData: {},
        error: 'answers required for quiz',
      };
    }
    const { points, passed } = scoreQuiz(basePoints, payload.answers, correctAnswers);
    return {
      success: passed,
      pointsAwarded: points,
      completionData: {
        answers: payload.answers,
        passed,
      },
      error: passed ? undefined : 'Quiz not passed',
    };
  }

  if (missionType === 'minigame') {
    const success = payload.won === true || payload.completed === true;
    return {
      success,
      pointsAwarded: success ? basePoints : Math.floor(basePoints * 0.25),
      completionData: {
        won: payload.won ?? false,
        completed: payload.completed ?? false,
      },
      error: success ? undefined : 'Minigame not completed',
    };
  }

  if (missionType === 'real_world') {
    const success = payload.confirmed === true;
    return {
      success,
      pointsAwarded: success ? basePoints : 0,
      completionData: { confirmed: payload.confirmed ?? false },
      error: success ? undefined : 'Real-world mission requires confirmation',
    };
  }

  return {
    success: false,
    pointsAwarded: 0,
    completionData: {},
    error: `Unknown mission type: ${missionType}`,
  };
}
