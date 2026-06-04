import {
  computeAdaptiveIntervalMs,
  computeEffectiveAdaptiveInterval,
  pushRiskScore,
  RISK_INTERVAL_HIGH_MS,
  RISK_INTERVAL_LOW_MS,
  RISK_INTERVAL_MEDIUM_MS,
} from '../src/utils/adaptiveCapture';

describe('adaptiveCapture', () => {
  it('uses 10s interval when average risk > 70', () => {
    expect(computeAdaptiveIntervalMs([85, 90, 80])).toBe(RISK_INTERVAL_HIGH_MS);
  });

  it('uses 30s interval when average risk is 30-70', () => {
    expect(computeAdaptiveIntervalMs([40, 50, 45])).toBe(RISK_INTERVAL_MEDIUM_MS);
  });

  it('uses 60s interval when average risk < 30', () => {
    expect(computeAdaptiveIntervalMs([10, 15, 20])).toBe(RISK_INTERVAL_LOW_MS);
  });

  it('returns to 60s after three low-risk captures', () => {
    let history: number[] = [];
    history = pushRiskScore(history, 85);
    expect(computeAdaptiveIntervalMs(history)).toBe(RISK_INTERVAL_HIGH_MS);
    history = pushRiskScore(history, 10);
    history = pushRiskScore(history, 12);
    history = pushRiskScore(history, 8);
    expect(computeAdaptiveIntervalMs(history)).toBe(RISK_INTERVAL_LOW_MS);
  });

  it('computeEffectiveAdaptiveInterval caps Chrome at 30s when risk base is 60s', () => {
    expect(
      computeEffectiveAdaptiveInterval([10, 15, 20], 'com.android.chrome'),
    ).toBe(30_000);
  });

  it('computeEffectiveAdaptiveInterval keeps 10s for high-risk Chrome', () => {
    expect(
      computeEffectiveAdaptiveInterval([85, 90, 80], 'com.android.chrome'),
    ).toBe(RISK_INTERVAL_HIGH_MS);
  });

  it('computeEffectiveAdaptiveInterval returns 0 for games', () => {
    expect(
      computeEffectiveAdaptiveInterval([10, 15, 20], 'com.roblox.client'),
    ).toBe(0);
  });

  it('computeEffectiveAdaptiveInterval ignores unknown package', () => {
    expect(computeEffectiveAdaptiveInterval([85, 90, 80], 'unknown')).toBe(
      RISK_INTERVAL_HIGH_MS,
    );
    expect(computeEffectiveAdaptiveInterval([85, 90, 80])).toBe(
      RISK_INTERVAL_HIGH_MS,
    );
  });

  it('computeEffectiveAdaptiveInterval floors education at 120s', () => {
    expect(
      computeEffectiveAdaptiveInterval([85, 90, 80], 'com.duolingo'),
    ).toBe(120_000);
  });
});
