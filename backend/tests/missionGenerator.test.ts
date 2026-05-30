import {
  pickMissionTemplate,
  generateMissionForChild,
  MISSION_TEMPLATES,
} from '../src/services/missionGenerator';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../src/services/missionHelpers', () => ({
  expireStaleMissions: jest.fn().mockResolvedValue(0),
  countPendingMissions: jest.fn(),
  getChildAge: jest.fn(),
  getChildRecentScores: jest.fn(),
  getChildMissionHistory: jest.fn(),
}));

import { query } from '../src/db/pool';
import {
  countPendingMissions,
  getChildAge,
  getChildRecentScores,
  getChildMissionHistory,
  expireStaleMissions,
} from '../src/services/missionHelpers';

const mockedQuery = query as jest.Mock;
const mockedCountPending = countPendingMissions as jest.Mock;
const mockedGetChildAge = getChildAge as jest.Mock;
const mockedGetRecentScores = getChildRecentScores as jest.Mock;
const mockedGetHistory = getChildMissionHistory as jest.Mock;

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

  it('selects quiz or minigame for risky content', () => {
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
    expect(['quiz_safety', 'tictactoe']).toContain(key);
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
});

describe('generateMissionForChild', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCountPending.mockResolvedValue(0);
    mockedGetChildAge.mockResolvedValue(12);
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
    expect(mockedQuery).toHaveBeenCalled();
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
