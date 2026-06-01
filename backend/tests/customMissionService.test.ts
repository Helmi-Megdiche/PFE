import {
  createCustomMission,
  deleteCustomMission,
  getActiveCustomMissions,
  updateCustomMission,
} from '../src/services/customMissionService';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

import { query } from '../src/db/pool';

const mockedQuery = query as jest.Mock;

const PARENT_ID = '11111111-1111-1111-1111-111111111111';

describe('customMissionService', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('lists active custom missions for parent', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'm1',
          title: 'Walk the dog',
          description: '15 min walk',
          points: 25,
        },
      ],
    });

    const rows = await getActiveCustomMissions(PARENT_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Walk the dog');
  });

  it('creates a custom mission', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'm2',
          parent_id: PARENT_ID,
          title: 'Read',
          description: 'Read 20 pages',
          points: 30,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });

    const row = await createCustomMission(
      PARENT_ID,
      'Read',
      'Read 20 pages',
      30,
    );
    expect(row.points).toBe(30);
  });

  it('updates a custom mission', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'm2',
          parent_id: PARENT_ID,
          title: 'Read more',
          description: 'Read 30 pages',
          points: 40,
          is_active: true,
          created_at: new Date().toISOString(),
        },
      ],
    });

    const row = await updateCustomMission(
      'm2',
      PARENT_ID,
      'Read more',
      'Read 30 pages',
      40,
    );
    expect(row?.points).toBe(40);
  });

  it('deletes a custom mission', async () => {
    mockedQuery.mockResolvedValue({ rowCount: 1 });
    const ok = await deleteCustomMission('m2', PARENT_ID);
    expect(ok).toBe(true);
  });
});
