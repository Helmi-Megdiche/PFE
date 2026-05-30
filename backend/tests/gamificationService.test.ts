import {
  addPoints,
  checkAndAwardBadges,
  getChildPoints,
} from '../src/services/gamificationService';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

jest.mock('../src/services/missionHelpers', () => ({
  countCompletedMissions: jest.fn(),
  countCognitiveExercisesCompleted: jest.fn(),
  countRiskyContentMissionsCompleted: jest.fn(),
  getWellbeingStreak: jest.fn(),
}));

import { query } from '../src/db/pool';
import {
  countCompletedMissions,
  countCognitiveExercisesCompleted,
  countRiskyContentMissionsCompleted,
  getWellbeingStreak,
} from '../src/services/missionHelpers';

const mockedQuery = query as jest.Mock;
const mockedCompleted = countCompletedMissions as jest.Mock;
const mockedCognitive = countCognitiveExercisesCompleted as jest.Mock;
const mockedRisky = countRiskyContentMissionsCompleted as jest.Mock;
const mockedStreak = getWellbeingStreak as jest.Mock;

describe('gamificationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('addPoints upserts child_points', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await addPoints('child-1', 25);

    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO child_points'),
      ['child-1', 25],
    );
  });

  it('getChildPoints returns 0 when no row exists', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const points = await getChildPoints('child-1');
    expect(points).toBe(0);
  });

  it('awards First Mission badge when one mission completed', async () => {
    mockedCompleted.mockResolvedValue(1);
    mockedCognitive.mockResolvedValue(0);
    mockedRisky.mockResolvedValue(0);
    mockedStreak.mockResolvedValue(0);

    mockedQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'badge-1',
            name: 'First Mission',
            description: 'Complete your first mission',
            icon: '🎯',
            requirement_type: 'missions_completed',
            requirement_value: 1,
            points_awarded: 10,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ exists: false }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const awarded = await checkAndAwardBadges('child-1');

    expect(awarded).toContain('First Mission');
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO child_badges'),
      ['child-1', 'badge-1'],
    );
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
            name: 'First Mission',
            description: 'Complete your first mission',
            icon: '🎯',
            requirement_type: 'missions_completed',
            requirement_value: 1,
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
});
