/** Risk-based periodic capture intervals (Sprint 3.7 adaptive). */

export const RISK_INTERVAL_HIGH_MS = 10_000;
export const RISK_INTERVAL_MEDIUM_MS = 30_000;
export const RISK_INTERVAL_LOW_MS = 60_000;

export const RISK_HISTORY_SIZE = 3;

/**
 * Rolling average of last scores → periodic interval.
 * >70 → 10s, >30 → 30s, else 60s.
 */
export function computeAdaptiveIntervalMs(riskScores: number[]): number {
  if (riskScores.length === 0) {
    return RISK_INTERVAL_LOW_MS;
  }
  const avg = riskScores.reduce((sum, s) => sum + s, 0) / riskScores.length;
  if (avg > 70) {
    return RISK_INTERVAL_HIGH_MS;
  }
  if (avg > 30) {
    return RISK_INTERVAL_MEDIUM_MS;
  }
  return RISK_INTERVAL_LOW_MS;
}

export function pushRiskScore(history: number[], score: number, maxSize = RISK_HISTORY_SIZE): number[] {
  const next = [...history, score];
  if (next.length > maxSize) {
    return next.slice(-maxSize);
  }
  return next;
}
