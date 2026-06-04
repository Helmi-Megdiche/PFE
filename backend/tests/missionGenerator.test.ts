import {
  pickMissionTemplate,
  generateMissionForChild,
  generateMissionFromRisk,
  normalizeRiskCategory,
  MISSION_TEMPLATES,
} from '../src/services/missionGenerator';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../src/services/missionHelpers', () => ({
  expireStaleMissions: jest.fn().mockResolvedValue(0),
  countPendingMissions: jest.fn(),
  getChildAge: jest.fn(),
  getChildParentId: jest.fn(),
  getChildRecentScores: jest.fn(),
  getChildMissionHistory: jest.fn(),
  getAdaptiveRiskThreshold: jest.fn(),
  getCumulativeRisk: jest.fn(),
  countRiskyMissionsLast24h: jest.fn(),
  hasRecentRiskyMission: jest.fn(),
}));

jest.mock('../src/services/customMissionService', () => ({
  getActiveCustomMissions: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/quizService', () => ({
  enrichQuizMetadata: jest.fn((_key: string, template: unknown) =>
    Promise.resolve(template),
  ),
}));

import { query } from '../src/db/pool';
import {
  countPendingMissions,
  getChildAge,
  getChildParentId,
  getChildRecentScores,
  getChildMissionHistory,
  expireStaleMissions,
  getAdaptiveRiskThreshold,
  getCumulativeRisk,
  countRiskyMissionsLast24h,
  hasRecentRiskyMission,
} from '../src/services/missionHelpers';
import { enrichQuizMetadata } from '../src/services/quizService';
import { getActiveCustomMissions } from '../src/services/customMissionService';

const mockedEnrichQuiz = enrichQuizMetadata as jest.Mock;
const mockedGetCustomMissions = getActiveCustomMissions as jest.Mock;

const mockedQuery = query as jest.Mock;
const mockedCountPending = countPendingMissions as jest.Mock;
const mockedGetChildAge = getChildAge as jest.Mock;
const mockedGetChildParentId = getChildParentId as jest.Mock;
const mockedGetRecentScores = getChildRecentScores as jest.Mock;
const mockedGetHistory = getChildMissionHistory as jest.Mock;
const mockedAdaptiveThreshold = getAdaptiveRiskThreshold as jest.Mock;
const mockedCumulativeRisk = getCumulativeRisk as jest.Mock;
const mockedRiskyCount24h = countRiskyMissionsLast24h as jest.Mock;
const mockedRecentRisky = hasRecentRiskyMission as jest.Mock;

describe('normalizeRiskCategory', () => {
  it('maps aliases to normalized keys', () => {
    expect(normalizeRiskCategory('adult')).toBe('adult');
    expect(normalizeRiskCategory('gore')).toBe('violent');
    expect(normalizeRiskCategory('dangerous')).toBe('dangerous_challenge');
    expect(normalizeRiskCategory('dangerous_challenge')).toBe('dangerous_challenge');
    expect(normalizeRiskCategory('toxic')).toBe('toxic');
    expect(normalizeRiskCategory(undefined)).toBe('default');
    expect(normalizeRiskCategory('neutral')).toBe('default');
  });
});

describe('pickMissionTemplate', () => {
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects cognitive remediation for high addiction', () => {
    const { key, template } = pickMissionTemplate({
      triggerReason: 'high_addiction',
      triggerScore: 85,
      addictionScore: 85,
      wellbeingScore: 50,
      age: 14,
      recentTemplateKeys: [],
    });
    expect(['nback', 'tower', 'digital_detox']).toContain(key);
    expect(template.type).toBeDefined();
  });

  it('selects real-world missions for low wellbeing', () => {
    const { key, template } = pickMissionTemplate({
      triggerReason: 'low_wellbeing',
      triggerScore: 25,
      addictionScore: 40,
      wellbeingScore: 25,
      age: 12,
      recentTemplateKeys: [],
    });
    expect(['physical_activity', 'family_interaction']).toContain(key);
    expect(template.type).toBe('real_world');
  });

  it('selects category-specific missions for adult risky content', () => {
    const { key } = pickMissionTemplate({
      triggerReason: 'risky_content',
      triggerScore: 85,
      addictionScore: 30,
      wellbeingScore: 60,
      combinedRiskScore: 85,
      category: 'adult',
      age: 11,
      recentTemplateKeys: [],
    });
    expect([
      'digital_detox',
      'educational_relationships',
      'quiz_safety',
      'conflict_resolution_quiz',
      'tictactoe',
      'nback',
    ]).toContain(key);
  });

  it('selects category-specific missions for violent content', () => {
    const { key } = pickMissionTemplate({
      triggerReason: 'risky_content',
      triggerScore: 85,
      addictionScore: 30,
      wellbeingScore: 60,
      combinedRiskScore: 85,
      category: 'gore',
      age: 11,
      recentTemplateKeys: [],
    });
    expect([
      'quiz_media_violence',
      'conflict_resolution_quiz',
      'kindness_mission',
      'tictactoe',
      'nback',
    ]).toContain(key);
  });

  it('selects category-specific missions for dangerous content', () => {
    const { key } = pickMissionTemplate({
      triggerReason: 'risky_content',
      triggerScore: 85,
      addictionScore: 30,
      wellbeingScore: 60,
      combinedRiskScore: 85,
      category: 'dangerous',
      age: 11,
      recentTemplateKeys: [],
    });
    expect(['safety_talk', 'parent_discussion']).toContain(key);
  });

  it('prefers addiction branch over adult category when addiction is high', () => {
    const { key } = pickMissionTemplate({
      triggerReason: 'risky_content',
      triggerScore: 85,
      addictionScore: 85,
      wellbeingScore: 60,
      combinedRiskScore: 85,
      category: 'adult',
      age: 14,
      recentTemplateKeys: [],
    });
    expect(['nback', 'tower', 'digital_detox']).toContain(key);
  });

  it('prefers simpler games for children under 10', () => {
    const { key } = pickMissionTemplate({
      triggerReason: 'high_addiction',
      triggerScore: 80,
      addictionScore: 80,
      wellbeingScore: 50,
      age: 8,
      recentTemplateKeys: [],
    });
    expect(['tictactoe', 'reaction', 'quiz_safety']).toContain(key);
  });

  it('uses nback level 3 for age 13+', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const { key, template } = pickMissionTemplate({
      triggerReason: 'high_addiction',
      triggerScore: 80,
      addictionScore: 80,
      wellbeingScore: 50,
      age: 14,
      recentTemplateKeys: [],
    });
    if (key === 'nback') {
      expect(template.metadata.level).toBe(3);
    } else {
      expect(MISSION_TEMPLATES[key]).toBeDefined();
    }
  });

  it('can pick a parent custom real-world mission', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
    const { key, template } = pickMissionTemplate({
      triggerReason: 'low_wellbeing',
      triggerScore: 30,
      addictionScore: 30,
      wellbeingScore: 30,
      age: 12,
      recentTemplateKeys: [],
      customMissions: [
        {
          id: 'custom-1',
          title: 'Walk the dog',
          description: '15 minute walk',
          points: 25,
        },
      ],
    });
    expect(key).toBe('custom:custom-1');
    expect(template.type).toBe('real_world');
    expect(template.title).toBe('Walk the dog');
    expect(template.metadata.customMissionId).toBe('custom-1');
  });
});

describe('generateMissionForChild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCountPending.mockResolvedValue(0);
    mockedGetChildAge.mockResolvedValue(12);
    mockedGetChildParentId.mockResolvedValue(null);
    mockedGetRecentScores.mockResolvedValue({
      addictionScore: 75,
      wellbeingScore: 35,
      date: '2026-05-29',
    });
    mockedGetHistory.mockResolvedValue([]);
    mockedQuery.mockResolvedValue({ rows: [{ id: 'mission-1' }], rowCount: 1 });
  });

  it('does not create mission when pending limit reached', async () => {
    mockedCountPending.mockResolvedValue(3);

    const result = await generateMissionForChild(
      'child-1',
      { type: 'high_addiction', score: 80 },
    );

    expect(result.created).toBe(false);
    expect(result.reason).toBe('pending_limit_reached');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('creates mission when under pending limit', async () => {
    const result = await generateMissionForChild(
      'child-1',
      { type: 'low_wellbeing', score: 30 },
    );

    expect(expireStaleMissions).toHaveBeenCalledWith('child-1');
    expect(result.created).toBe(true);
    expect(result.missionId).toBe('mission-1');
  });

  it('loads parent custom missions when parent exists', async () => {
    mockedGetChildParentId.mockResolvedValue('parent-1');
    mockedGetCustomMissions.mockResolvedValue([
      {
        id: 'c1',
        title: 'Custom chore',
        description: 'Tidy room',
        points: 20,
      },
    ]);

    await generateMissionForChild('child-1', { type: 'low_wellbeing', score: 30 });

    expect(mockedGetCustomMissions).toHaveBeenCalledWith('parent-1');
  });

  it('enriches quiz missions from the database', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    mockedGetRecentScores.mockResolvedValue({
      addictionScore: 30,
      wellbeingScore: 60,
      date: '2026-05-29',
    });

    await generateMissionForChild('child-1', {
      type: 'risky_content',
      score: 90,
    }, { category: 'default', combinedRiskScore: 90 });

    expect(mockedEnrichQuiz).toHaveBeenCalled();
  });

  it('applies escalation multiplier after template selection', async () => {
    mockedGetRecentScores.mockResolvedValue({
      addictionScore: 30,
      wellbeingScore: 60,
      date: '2026-05-29',
    });

    await generateMissionForChild(
      'child-1',
      { type: 'risky_content', score: 90 },
      {
        category: 'adult',
        combinedRiskScore: 90,
        escalationLevel: 1,
        escalationMultiplier: 1.3,
      },
    );

    const insertArgs = mockedQuery.mock.calls[0][1];
    expect(insertArgs[3]).toBe(Math.ceil(30 * 1.3));
    const metadata = JSON.parse(insertArgs[5] as string);
    expect(metadata.basePoints).toBe(30);
    expect(metadata.escalationLevel).toBe(1);
  });
});

describe('generateMissionFromRisk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAdaptiveThreshold.mockResolvedValue(50);
    mockedCumulativeRisk.mockResolvedValue({ sum: 0, count: 0 });
    mockedRecentRisky.mockResolvedValue(false);
    mockedRiskyCount24h.mockResolvedValue(0);
    mockedCountPending.mockResolvedValue(0);
    mockedGetChildAge.mockResolvedValue(12);
    mockedGetRecentScores.mockResolvedValue({
      addictionScore: 30,
      wellbeingScore: 60,
      date: '2026-05-29',
    });
    mockedGetHistory.mockResolvedValue([]);
    mockedQuery.mockResolvedValue({ rows: [{ id: 'risk-mission' }], rowCount: 1 });
  });

  it('creates mission when score exceeds adaptive threshold', async () => {
    mockedAdaptiveThreshold.mockResolvedValue(50);
    const result = await generateMissionFromRisk('child-1', 75, 'adult');
    expect(result.created).toBe(true);
    expect(result.missionId).toBe('risk-mission');
  });

  it('creates mission when score equals adaptive threshold', async () => {
    mockedAdaptiveThreshold.mockResolvedValue(70);
    const result = await generateMissionFromRisk('child-1', 70, 'adult');
    expect(result.created).toBe(true);
    expect(result.missionId).toBe('risk-mission');
  });

  it('creates mission on cumulative trigger when individual score is low', async () => {
    mockedAdaptiveThreshold.mockResolvedValue(80);
    mockedCumulativeRisk.mockResolvedValue({ sum: 310, count: 4 });
    const result = await generateMissionFromRisk('child-1', 40, 'adult');
    expect(result.created).toBe(true);
  });

  it('skips when below threshold and no cumulative trigger', async () => {
    mockedAdaptiveThreshold.mockResolvedValue(80);
    mockedCumulativeRisk.mockResolvedValue({ sum: 100, count: 2 });
    const result = await generateMissionFromRisk('child-1', 40, 'adult');
    expect(result.created).toBe(false);
    expect(result.reason).toBe('below_risk_threshold');
  });

  it('skips when cooldown is active', async () => {
    mockedRecentRisky.mockResolvedValue(true);
    const result = await generateMissionFromRisk('child-1', 90, 'adult');
    expect(result.created).toBe(false);
    expect(result.reason).toBe('cooldown_active');
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('applies escalation after 3 prior risky missions in 24h', async () => {
    mockedRiskyCount24h.mockResolvedValue(3);
    await generateMissionFromRisk('child-1', 75, 'adult');
    const insertArgs = mockedQuery.mock.calls[0][1];
    expect(insertArgs[3]).toBe(Math.ceil(30 * 1.3));
  });
});

describe('expireStaleMissions integration', () => {
  it('calls expire helper before generation', async () => {
    mockedCountPending.mockResolvedValue(0);
    mockedGetChildAge.mockResolvedValue(null);
    mockedGetRecentScores.mockResolvedValue(null);
    mockedGetHistory.mockResolvedValue([]);
    mockedQuery.mockResolvedValue({ rows: [{ id: 'm2' }], rowCount: 1 });

    await generateMissionForChild('child-2', { type: 'risky_content', score: 90 });

    expect(expireStaleMissions).toHaveBeenCalledWith('child-2');
  });
});
