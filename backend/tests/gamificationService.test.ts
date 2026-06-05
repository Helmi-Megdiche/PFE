import {
  addPoints,
  ageMatchesRange,
  checkAndAwardBadges,
  deductPoints,
  getChildLevel,
  getChildPoints,
  parseAgeRange,
  revokeMismatchedAgeBadges,
} from '../src/services/gamificationService';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../src/services/missionHelpers', () => ({
  countCompletedMissions: jest.fn(),
  countCognitiveExercisesCompleted: jest.fn(),
  countRiskyContentMissionsCompleted: jest.fn(),
  getWellbeingStreak: jest.fn(),
  getChildAge: jest.fn(),
}));

import { query } from '../src/db/pool';
import {
  countCompletedMissions,
  countCognitiveExercisesCompleted,
  countRiskyContentMissionsCompleted,
  getChildAge,
  getWellbeingStreak,
} from '../src/services/missionHelpers';

const mockedQuery = query as jest.Mock;
const mockedCompleted = countCompletedMissions as jest.Mock;
const mockedCognitive = countCognitiveExercisesCompleted as jest.Mock;
const mockedRisky = countRiskyContentMissionsCompleted as jest.Mock;
const mockedStreak = getWellbeingStreak as jest.Mock;
const mockedAge = getChildAge as jest.Mock;

describe('gamificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAge.mockResolvedValue(null);
  });

  it('addPoints upserts child_points', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await addPoints('child-1', 25);

    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO child_points'),
      ['child-1', 25],
    );
  });

  it('getChildLevel returns 1 for 0–499 points', () => {
    expect(getChildLevel(0)).toBe(1);
    expect(getChildLevel(499)).toBe(1);
  });

  it('getChildLevel increases every 500 points', () => {
    expect(getChildLevel(500)).toBe(2);
    expect(getChildLevel(999)).toBe(2);
    expect(getChildLevel(1000)).toBe(3);
  });

  it('getChildLevel treats negative points as level 1', () => {
    expect(getChildLevel(-10)).toBe(1);
  });

  it('getChildPoints returns 0 when no row exists', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const points = await getChildPoints('child-1');
    expect(points).toBe(0);
  });

  it('deductPoints floors total at zero', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total_points: 0 }], rowCount: 1 });

    const total = await deductPoints('child-1', 10);
    expect(total).toBe(0);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST(0'),
      ['child-1', 10],
    );
  });

  it('deductPoints returns updated balance', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total_points: 40 }], rowCount: 1 });

    const total = await deductPoints('child-1', 10);
    expect(total).toBe(40);
  });

  it('deductPoints with zero amount returns current points', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ total_points: 25 }], rowCount: 1 });
    const total = await deductPoints('child-1', 0);
    expect(total).toBe(25);
  });

  it('parses age range from requirement_config', () => {
    const range = parseAgeRange({
      id: 'b1',
      name: 'Young Adventurer',
      description: null,
      icon: null,
      requirement_type: 'age_range',
      requirement_value: null,
      requirement_config: { min: 10, max: 12 },
      points_awarded: 30,
    });
    expect(range).toEqual({ min: 10, max: 12 });
    expect(ageMatchesRange(12, range!)).toBe(true);
    expect(ageMatchesRange(13, range!)).toBe(false);
  });

  it('awards First Steps badge when one mission completed', async () => {
    mockedCompleted.mockResolvedValue(1);
    mockedCognitive.mockResolvedValue(0);
    mockedRisky.mockResolvedValue(0);
    mockedStreak.mockResolvedValue(0);

    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'badge-1',
            name: 'First Steps',
            description: 'Complete 1 mission',
            icon: '👣',
            requirement_type: 'missions_completed',
            requirement_value: 1,
            requirement_config: null,
            points_awarded: 10,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const awarded = await checkAndAwardBadges('child-1');

    expect(awarded).toContain('First Steps');
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO child_badges'),
      ['child-1', 'badge-1'],
    );
  });

  it('awards age badge when child age matches range', async () => {
    mockedCompleted.mockResolvedValue(0);
    mockedCognitive.mockResolvedValue(0);
    mockedRisky.mockResolvedValue(0);
    mockedStreak.mockResolvedValue(0);
    mockedAge.mockResolvedValue(12);

    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'age-badge',
            name: 'Young Adventurer',
            description: 'Age 10-12 years',
            icon: '🧑',
            requirement_type: 'age_range',
            requirement_value: null,
            requirement_config: { min: 10, max: 12 },
            points_awarded: 30,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const awarded = await checkAndAwardBadges('child-1');

    expect(awarded).toContain('Young Adventurer');
  });

  it('does not duplicate badge when already earned', async () => {
    mockedCompleted.mockResolvedValue(1);
    mockedCognitive.mockResolvedValue(0);
    mockedRisky.mockResolvedValue(0);
    mockedStreak.mockResolvedValue(0);

    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'badge-1',
            name: 'First Steps',
            description: 'Complete 1 mission',
            icon: '👣',
            requirement_type: 'missions_completed',
            requirement_value: 1,
            requirement_config: null,
            points_awarded: 10,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ exists: true }], rowCount: 1 });

    const awarded = await checkAndAwardBadges('child-1');

    expect(awarded).toEqual([]);
    expect(mockedQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO child_badges'),
      expect.anything(),
    );
  });

  it('revokeMismatchedAgeBadges removes stale bands and deducts points', async () => {
    mockedAge.mockResolvedValue(12);

    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            badge_id: 'age-teen',
            id: 'age-teen',
            name: 'Teen Champion',
            description: null,
            icon: null,
            requirement_type: 'age_range',
            requirement_value: null,
            requirement_config: { min: 13, max: 17 },
            points_awarded: 40,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ total_points: 100 }], rowCount: 1 });

    const revoked = await revokeMismatchedAgeBadges('child-1');

    expect(revoked).toEqual(['Teen Champion']);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM child_badges'),
      ['child-1', 'age-teen'],
    );
  });

  it('revokeMismatchedAgeBadges keeps matching age badge', async () => {
    mockedAge.mockResolvedValue(12);

    mockedQuery.mockResolvedValueOnce({
      rows: [
        {
          badge_id: 'age-young',
          id: 'age-young',
          name: 'Young Adventurer',
          description: null,
          icon: null,
          requirement_type: 'age_range',
          requirement_value: null,
          requirement_config: { min: 10, max: 12 },
          points_awarded: 30,
        },
      ],
      rowCount: 1,
    });

    const revoked = await revokeMismatchedAgeBadges('child-1');

    expect(revoked).toEqual([]);
    expect(mockedQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM child_badges'),
      expect.anything(),
    );
  });
});
