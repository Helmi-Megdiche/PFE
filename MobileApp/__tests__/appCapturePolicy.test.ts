import {
  getAppCategory,
  getEffectiveIntervalMs,
} from '../src/utils/appCapturePolicy';
import { RISK_INTERVAL_HIGH_MS, RISK_INTERVAL_LOW_MS } from '../src/utils/adaptiveCapture';

describe('appCapturePolicy', () => {
  it('maps Chrome to browser_social', () => {
    expect(getAppCategory('com.android.chrome')).toBe('browser_social');
  });

  it('maps Roblox to game', () => {
    expect(getAppCategory('com.roblox.client')).toBe('game');
  });

  it('maps Duolingo to education', () => {
    expect(getAppCategory('com.duolingo')).toBe('education');
  });

  it('caps browser_social at 30s when risk base is 60s', () => {
    expect(getEffectiveIntervalMs(RISK_INTERVAL_LOW_MS, 'com.android.chrome')).toBe(
      30_000,
    );
  });

  it('keeps faster risk interval when below 30s cap', () => {
    expect(getEffectiveIntervalMs(RISK_INTERVAL_HIGH_MS, 'com.android.chrome')).toBe(
      RISK_INTERVAL_HIGH_MS,
    );
  });

  it('disables periodic capture for games', () => {
    expect(getEffectiveIntervalMs(RISK_INTERVAL_LOW_MS, 'com.roblox.client')).toBe(0);
  });

  it('floors education at 120s', () => {
    expect(getEffectiveIntervalMs(RISK_INTERVAL_HIGH_MS, 'com.duolingo')).toBe(120_000);
  });

  it('keeps default apps on risk interval', () => {
    expect(getEffectiveIntervalMs(RISK_INTERVAL_LOW_MS, 'com.example.app')).toBe(
      RISK_INTERVAL_LOW_MS,
    );
  });
});
