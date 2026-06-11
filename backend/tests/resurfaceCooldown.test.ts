jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

import { query } from '../src/db/pool';
import {
  computeResurfacedPoints,
  getResurfaceableRiskyMission,
} from '../src/services/missionHelpers';

const mockedQuery = query as jest.Mock;

describe('cooldown resurface helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computeResurfacedPoints still caps bonus for re-opened missions', () => {
    expect(computeResurfacedPoints(48, 30)).toBe(45);
  });

  it('returns completed risky mission for overlay-only resurface during cooldown', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'm-completed',
            title: 'Conflict Resolution',
            description: 'Quiz',
            points: 48,
            status: 'completed',
            metadata: { type: 'quiz' },
          },
        ],
      });

    const row = await getResurfaceableRiskyMission('child-1', 2);
    expect(row?.id).toBe('m-completed');
    expect(row?.status).toBe('completed');
    expect(mockedQuery).toHaveBeenCalledTimes(2);
  });

  it('does not resurface completed real_world missions during cooldown', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'm-rw-done',
            title: 'Spread Kindness',
            description: 'Kind message',
            points: 30,
            status: 'completed',
            metadata: { type: 'real_world' },
          },
        ],
      });

    const row = await getResurfaceableRiskyMission('child-1', 2);
    expect(row).toBeNull();
  });

  it('re-opens failed risky mission to pending during cooldown', async () => {
    mockedQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'm-failed',
            title: 'Learn About Respect',
            description: 'Video',
            points: 48,
            status: 'failed',
            metadata: { type: 'real_world' },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const row = await getResurfaceableRiskyMission('child-1', 2);
    expect(row?.status).toBe('pending');
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'pending'"),
      ['m-failed'],
    );
  });
});
