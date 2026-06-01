import { query } from '../db/pool';
import { env } from '../config/env';
import {
  countPendingMissions,
  expireStaleMissions,
  getAdaptiveRiskThreshold,
  getChildAge,
  getChildMissionHistory,
  getChildRecentScores,
  getCumulativeRisk,
  countRiskyMissionsLast24h,
  hasRecentRiskyMission,
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
  educational_relationships: {
    type: 'real_world',
    title: 'Learn About Respect',
    description: 'Watch a 5-min video about healthy relationships with a parent',
    points: 30,
    metadata: { action: 'educational_video' },
  },
  kindness_mission: {
    type: 'real_world',
    title: 'Spread Kindness',
    description: 'Write a kind message to a family member',
    points: 25,
    metadata: { action: 'kind_message' },
  },
  conflict_resolution_quiz: {
    type: 'quiz',
    title: 'Conflict Resolution',
    description: 'Answer 3 questions about resolving arguments peacefully',
    points: 30,
    metadata: {
      category: 'conflict',
      numQuestions: 3,
      correctAnswers: ['A', 'B', 'C'],
    },
  },
  positive_communication: {
    type: 'real_world',
    title: 'Use Kind Words',
    description: 'Speak only kind words for the next hour',
    points: 35,
    metadata: { action: 'kindness_hour' },
  },
  safety_talk: {
    type: 'real_world',
    title: 'Safety Talk',
    description: 'Discuss online safety with a parent',
    points: 40,
    metadata: { action: 'parent_discussion' },
  },
  empathy_exercise: {
    type: 'quiz',
    title: 'Empathy Challenge',
    description: 'Answer 2 questions about how others feel',
    points: 25,
    metadata: {
      category: 'empathy',
      numQuestions: 2,
      correctAnswers: ['A', 'B'],
    },
  },
  parent_discussion: {
    type: 'real_world',
    title: 'Parent Chat',
    description: 'Have a 5-min conversation with a parent about staying safe online',
    points: 40,
    metadata: { action: 'discussion' },
  },
};

const RISK_CATEGORY_TEMPLATES: Record<string, string[]> = {
  adult: ['digital_detox', 'educational_relationships'],
  violent: ['kindness_mission', 'conflict_resolution_quiz'],
  toxic: ['positive_communication', 'empathy_exercise'],
  dangerous_challenge: ['safety_talk', 'parent_discussion'],
  default: ['quiz_safety', 'tictactoe'],
};

export function normalizeRiskCategory(category?: string): string {
  const cat = (category || '').toLowerCase();
  if (cat === 'dangerous' || cat === 'dangerous_challenge') return 'dangerous_challenge';
  if (cat === 'violent' || cat === 'gore') return 'violent';
  if (cat === 'adult') return 'adult';
  if (cat === 'toxic') return 'toxic';
  return 'default';
}

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
    const normalized = normalizeRiskCategory(input.category);
    const templateKeys =
      RISK_CATEGORY_TEMPLATES[normalized] ?? RISK_CATEGORY_TEMPLATES.default;
    key = avoidRecent(recent, templateKeys);
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
  escalationLevel?: number;
  escalationMultiplier?: number;
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

  const basePoints = template.points;
  const multiplier = context?.escalationMultiplier ?? 1;
  const finalPoints = multiplier > 1 ? Math.ceil(basePoints * multiplier) : basePoints;

  const metadata = {
    type: template.type,
    templateKey: key,
    triggerScore: trigger.score,
    triggerCategory: context?.category ?? null,
    basePoints,
    escalationLevel: context?.escalationLevel ?? 0,
    escalationMultiplier: multiplier,
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
      finalPoints,
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
  const threshold = await getAdaptiveRiskThreshold(childId);
  const { sum, count } = await getCumulativeRisk(childId);
  const cumulativeTrigger = sum > 300 && count >= 3;

  if (await hasRecentRiskyMission(childId, env.missionRiskCooldownMinutes)) {
    return { created: false, reason: 'cooldown_active' };
  }

  const shouldCreate = combinedRiskScore >= threshold || cumulativeTrigger;
  if (!shouldCreate) {
    return { created: false, reason: 'below_risk_threshold' };
  }

  const riskyCount24h = await countRiskyMissionsLast24h(childId);
  const escalationLevel = Math.min(2, Math.floor(riskyCount24h / 3));
  const escalationMultiplier = 1 + escalationLevel * 0.3;

  return generateMissionForChild(
    childId,
    { type: 'risky_content', score: combinedRiskScore },
    { combinedRiskScore, category, escalationLevel, escalationMultiplier },
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
