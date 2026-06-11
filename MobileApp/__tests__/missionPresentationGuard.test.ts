import {
  markMonitoringStarted,
  resetMissionPresentationGuard,
  shouldPresentMissionFromCapture,
} from '../src/utils/missionPresentationGuard';

describe('missionPresentationGuard', () => {
  beforeEach(() => {
    resetMissionPresentationGuard();
  });

  it('allows first presentation of a mission', () => {
    expect(shouldPresentMissionFromCapture('m1')).toBe(true);
  });

  it('debounces the same mission within 90s', () => {
    expect(shouldPresentMissionFromCapture('m1')).toBe(true);
    expect(shouldPresentMissionFromCapture('m1')).toBe(false);
    expect(shouldPresentMissionFromCapture('m2')).toBe(true);
  });

  it('blocks re-surfaced missions during monitoring startup grace', () => {
    markMonitoringStarted();
    expect(shouldPresentMissionFromCapture('m1', { reSurfaced: true })).toBe(false);
    expect(shouldPresentMissionFromCapture('m1', { reSurfaced: false })).toBe(true);
  });

  it('debounces repeated re-surfaced presentations within 60s', () => {
    expect(shouldPresentMissionFromCapture('m1', { reSurfaced: true })).toBe(true);
    expect(shouldPresentMissionFromCapture('m1', { reSurfaced: true })).toBe(false);
    expect(shouldPresentMissionFromCapture('m2', { reSurfaced: true })).toBe(true);
  });

  it('re-surfaced presentation bypasses the 90s debounce for a new cooldown block', () => {
    jest.useFakeTimers();
    expect(shouldPresentMissionFromCapture('m1')).toBe(true);
    expect(shouldPresentMissionFromCapture('m1')).toBe(false);
    jest.advanceTimersByTime(61_000);
    expect(shouldPresentMissionFromCapture('m1', { reSurfaced: true })).toBe(true);
    jest.useRealTimers();
  });
});
