jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

import { query } from '../src/db/pool';
import {
  getAdaptiveRiskThreshold,
  getCumulativeRisk,
  countRiskyMissionsLast24h,
  hasRecentRiskyMission,
} from '../src/services/missionHelpers';

const mockedQuery = query as jest.Mock;

describe('getAdaptiveRiskThreshold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns avg + 10 clamped between 50 and 80', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ avg_risk: '55' }] });
    await expect(getAdaptiveRiskThreshold('child-1')).resolves.toBe(65);
  });

  it('floors at 50 for low average risk', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ avg_risk: '30' }] });
    await expect(getAdaptiveRiskThreshold('child-1')).resolves.toBe(50);
  });

  it('caps at 80 for high average risk', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ avg_risk: '75' }] });
    await expect(getAdaptiveRiskThreshold('child-1')).resolves.toBe(80);
  });

  it('defaults to 50 when no history', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ avg_risk: null }] });
    await expect(getAdaptiveRiskThreshold('child-1')).resolves.toBe(50);
  });
});

describe('getCumulativeRisk', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns sum and count from last 5 events subquery', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ sum: '310', count: '4' }] });
    await expect(getCumulativeRisk('child-1')).resolves.toEqual({ sum: 310, count: 4 });
  });

  it('returns zero when no recent events', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ sum: '0', count: '0' }] });
    await expect(getCumulativeRisk('child-1')).resolves.toEqual({ sum: 0, count: 0 });
  });
});

describe('countRiskyMissionsLast24h', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns count of risky_content missions in last 24h', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ cnt: '3' }] });
    await expect(countRiskyMissionsLast24h('child-1')).resolves.toBe(3);
  });
});

describe('hasRecentRiskyMission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns true when a pending risky mission exists', async () => {
    mockedQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    await expect(hasRecentRiskyMission('child-1', 15)).resolves.toBe(true);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'"),
      ['child-1'],
    );
  });

  it('returns false when no recent risky mission', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    await expect(hasRecentRiskyMission('child-1', 15)).resolves.toBe(false);
  });

  it('ignores minutes parameter (cooldown is pending-only)', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    await hasRecentRiskyMission('child-1', 30);
    expect(mockedQuery).toHaveBeenCalledWith(expect.any(String), ['child-1']);
  });
});
