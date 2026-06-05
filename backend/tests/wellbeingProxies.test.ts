import {
  fetchBedtimeVarianceMinutes,
  fetchFamilyInteractionCount,
  fetchPhysicalActivityMinutes,
  fetchRecommendedScreenMinutes,
} from '../src/scoring/wellbeingProxies';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

import { query } from '../src/db/pool';

const mockedQuery = query as jest.Mock;

describe('wellbeingProxies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('computes physical activity minutes from completed missions', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] });
    const minutes = await fetchPhysicalActivityMinutes(
      'child-1',
      new Date('2026-06-04T00:00:00.000Z'),
    );
    expect(minutes).toBe(20);
  });

  it('caps physical activity minutes at 60', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });
    const minutes = await fetchPhysicalActivityMinutes(
      'child-1',
      new Date('2026-06-04T00:00:00.000Z'),
    );
    expect(minutes).toBe(60);
  });

  it('falls back to 30 minutes bedtime variance when no data', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ variance_seconds: null }] });
    const minutes = await fetchBedtimeVarianceMinutes(
      'child-1',
      new Date('2026-06-04T00:00:00.000Z'),
    );
    expect(minutes).toBe(30);
  });

  it('converts bedtime variance seconds to minutes', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ variance_seconds: '1800' }] });
    const minutes = await fetchBedtimeVarianceMinutes(
      'child-1',
      new Date('2026-06-04T00:00:00.000Z'),
    );
    expect(minutes).toBe(30);
  });

  it('counts family interaction missions', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ count: '3' }] });
    const count = await fetchFamilyInteractionCount(
      'child-1',
      new Date('2026-06-04T00:00:00.000Z'),
    );
    expect(count).toBe(3);
  });

  it('returns age-based recommended screen minutes', async () => {
    mockedQuery.mockResolvedValueOnce({ rows: [{ birth_year: 2018 }] });
    expect(await fetchRecommendedScreenMinutes('child-1')).toBe(120);

    mockedQuery.mockResolvedValueOnce({ rows: [{ birth_year: 2014 }] });
    expect(await fetchRecommendedScreenMinutes('child-1')).toBe(150);

    mockedQuery.mockResolvedValueOnce({ rows: [{ birth_year: 2010 }] });
    expect(await fetchRecommendedScreenMinutes('child-1')).toBe(180);

    mockedQuery.mockResolvedValueOnce({ rows: [{ birth_year: null }] });
    expect(await fetchRecommendedScreenMinutes('child-1')).toBe(180);
  });
});
