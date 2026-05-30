import { query } from '../db/pool';
import {
  countPendingMissions,
  expireStaleMissions,
  getChildAge,
  getChildMissionHistory,
  getChildRecentScores,
} from './missionHelpers';

export type MissionType = 'real_world' | 'quiz' | 'minigame' | 'cognitive';

export interface MissionTemplate {
  type: MissionType;
  title: string;
  description: string;
  points: number;
  metadata: Record<string, unknown>;
}

export const MISSION_TEMPLATES: Record<string, MissionTemplate> = {
  physical_activity: {
    type: 'real_world',
    title: 'Move Your Body',
    description: 'Do 15 jumping jacks',
    points: 20,
    metadata: { action: 'jumping_jacks' },
  },
  family_interaction: {
    type: 'real_world',
    title: 'Family Time',
    description: 'Ask a parent for a board game',
    points: 35,
    metadata: { action: 'board_game' },
  },
  digital_detox: {
    type: 'real_world',
    title: 'Screen-Free Break',
    description: 'Take a 30-minute break from screens',
    points: 30,
    metadata: { action: 'digital_detox', minutes: 30 },
  },
  nback: {
    type: 'cognitive',
    title: 'Memory Challenge',
    description: 'Play N-back (level 2)',
    points: 30,
    metadata: { exercise: 'nback', level: 2 },
  },
  reaction: {
    type: 'cognitive',
    title: 'Reaction Time',
    description: 'Tap as fast as you can',
    points: 25,
    metadata: { exercise: 'reaction' },
  },
  tower: {
    type: 'cognitive',
    title: 'Tower of Hanoi',
    description: 'Solve the puzzle in minimum moves',
    points: 40,
    metadata: { exercise: 'hanoi', disks: 3 },
  },
  quiz_safety: {
    type: 'quiz',
    title: 'Online Safety Quiz',
    description: 'Answer 3 questions about staying safe online',
    points: 30,
    metadata: {
      category: 'safety',
      numQuestions: 3,
      correctAnswers: ['A', 'B', 'A'],
    },
  },
  tictactoe: {
    type: 'minigame',
    title: 'Tic-Tac-Toe',
    description: 'Beat the computer',
    points: 20,
    metadata: { game: 'tictactoe' },
  },
  sudoku: {
    type: 'minigame',
    title: 'Mini Sudoku',
    description: 'Fill the grid',
    points: 35,
    metadata: { game: 'sudoku', size: 4 },
  },
};

export type MissionTriggerReason =
  | 'risky_content'
  | 'low_wellbeing'
  | 'high_addiction'
  | 'cognitive_boost';

export interface PickMissionInput {
  triggerReason: MissionTriggerReason;
  triggerScore: number;
  addictionScore: number;
  wellbeingScore: number;
  combinedRiskScore?: number;
  category?: string;
  age: number | null;
  recentTemplateKeys: string[];
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function avoidRecent(keys: string[], candidates: string[]): string {
  const fresh = candidates.filter((key) => !keys.includes(key));
  return pickRandom(fresh.length > 0 ? fresh : candidates);
}

function applyAgeRules(templateKey: string, age: number | null): string {
  if (age == null) {
    return templateKey;
  }
  if (age < 10) {
    if (templateKey === 'sudoku' || templateKey === 'nback' || templateKey === 'tower') {
      return pickRandom(['tictactoe', 'reaction', 'quiz_safety']);
    }
    return templateKey;
  }
  if (age >= 13) {
    if (templateKey === 'tictactoe') {
      return pickRandom(['sudoku', 'nback']);
    }
    if (templateKey === 'nback') {
      return 'nback';
    }
  }
  return templateKey;
}

function cloneTemplate(key: string): { key: string; template: MissionTemplate } {
  const template = MISSION_TEMPLATES[key];
  const metadata = { ...template.metadata };
  return {
    key,
    template: {
      ...template,
      metadata,
    },
  };
}

/**
 * Pure decision tree for mission template selection (unit-testable).
 */
export function pickMissionTemplate(input: PickMissionInput): {
  key: string;
  template: MissionTemplate;
} {
  const recent = input.recentTemplateKeys;
  let key: string;

  if (input.triggerReason === 'high_addiction' || input.addictionScore > 70) {
    key = avoidRecent(recent, ['nback', 'tower', 'digital_detox']);
  } else if (input.triggerReason === 'low_wellbeing' || input.wellbeingScore < 40) {
    key = avoidRecent(recent, ['physical_activity', 'family_interaction']);
  } else if (
    input.triggerReason === 'risky_content' ||
    (input.combinedRiskScore != null && input.combinedRiskScore > 70)
  ) {
    key = avoidRecent(recent, ['quiz_safety', 'tictactoe']);
  } else {
    key = avoidRecent(recent, [
      'physical_activity',
      'family_interaction',
      'tictactoe',
      'sudoku',
    ]);
  }

  key = applyAgeRules(key, input.age);

  if (input.age != null && input.age >= 13 && key === 'nback') {
    const picked = cloneTemplate('nback');
    picked.template.metadata = { ...picked.template.metadata, level: 3 };
    picked.template.description = 'Play N-back (level 3)';
    return picked;
  }

  return cloneTemplate(key);
}

export interface MissionGenerationResult {
  created: boolean;
  missionId?: string;
  reason?: string;
}

export interface MissionTrigger {
  type: MissionTriggerReason;
  score: number;
}

export interface MissionGenerationContext {
  combinedRiskScore?: number;
  category?: string;
}

const MAX_PENDING_MISSIONS = 3;

function extractTemplateKeys(
  history: Awaited<ReturnType<typeof getChildMissionHistory>>,
): string[] {
  return history
    .map((row) => {
      const meta = row.metadata;
      if (meta && typeof meta.templateKey === 'string') {
        return meta.templateKey;
      }
      return null;
    })
    .filter((key): key is string => key != null);
}

export async function generateMissionForChild(
  childId: string,
  trigger: MissionTrigger,
  context?: MissionGenerationContext,
): Promise<MissionGenerationResult> {
  await expireStaleMissions(childId);

  const pendingCount = await countPendingMissions(childId);
  if (pendingCount >= MAX_PENDING_MISSIONS) {
    return { created: false, reason: 'pending_limit_reached' };
  }

  const [age, recentScores, history] = await Promise.all([
    getChildAge(childId),
    getChildRecentScores(childId),
    getChildMissionHistory(childId, 5),
  ]);

  const addictionScore = recentScores?.addictionScore ?? 0;
  const wellbeingScore = recentScores?.wellbeingScore ?? 50;

  const { key, template } = pickMissionTemplate({
    triggerReason: trigger.type,
    triggerScore: trigger.score,
    addictionScore,
    wellbeingScore,
    combinedRiskScore: context?.combinedRiskScore,
    category: context?.category,
    age,
    recentTemplateKeys: extractTemplateKeys(history),
  });

  const metadata = {
    type: template.type,
    templateKey: key,
    triggerScore: trigger.score,
    triggerCategory: context?.category ?? null,
    ...template.metadata,
  };

  const { rows } = await query<{ id: string }>(
    `INSERT INTO missions (
      child_id, title, description, points, status, trigger_reason, metadata
    ) VALUES ($1, $2, $3, $4, 'pending', $5, $6::jsonb)
    RETURNING id`,
    [
      childId,
      template.title,
      template.description,
      template.points,
      trigger.type,
      JSON.stringify(metadata),
    ],
  );

  return { created: true, missionId: rows[0].id };
}

export async function generateMissionFromRisk(
  childId: string,
  combinedRiskScore: number,
  category: string,
): Promise<MissionGenerationResult> {
  if (combinedRiskScore <= 70) {
    return { created: false, reason: 'below_risk_threshold' };
  }
  return generateMissionForChild(
    childId,
    { type: 'risky_content', score: combinedRiskScore },
    { combinedRiskScore, category },
  );
}

export async function generateMissionFromLowWellbeing(
  childId: string,
  wellbeingScore: number,
): Promise<MissionGenerationResult> {
  if (wellbeingScore >= 40) {
    return { created: false, reason: 'wellbeing_not_low' };
  }
  return generateMissionForChild(
    childId,
    { type: 'low_wellbeing', score: wellbeingScore },
    { category: 'wellbeing' },
  );
}

export async function generateMissionFromHighAddiction(
  childId: string,
  addictionScore: number,
): Promise<MissionGenerationResult> {
  if (addictionScore <= 70) {
    return { created: false, reason: 'addiction_not_high' };
  }
  return generateMissionForChild(
    childId,
    { type: 'high_addiction', score: addictionScore },
    { category: 'addiction' },
  );
}
