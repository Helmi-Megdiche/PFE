import {
  computeAdaptiveIntervalMs,
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
});
