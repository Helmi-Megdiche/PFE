/**
 * Prevents duplicate mission overlays when cooldown re-surfaces the same pending mission
 * or when several captures fire right after monitoring starts.
 */

const PRESENT_DEBOUNCE_MS = 90_000;
const STARTUP_GRACE_MS = 8_000;

let monitoringStartedAt = 0;
let lastPresentedMissionId: string | null = null;
let lastPresentedAt = 0;

export function markMonitoringStarted(): void {
  monitoringStartedAt = Date.now();
}

export function resetMissionPresentationGuard(): void {
  monitoringStartedAt = 0;
  lastPresentedMissionId = null;
  lastPresentedAt = 0;
}

export interface MissionPresentOptions {
  reSurfaced?: boolean;
}

export function shouldPresentMissionFromCapture(
  missionId: string,
  options?: MissionPresentOptions,
): boolean {
  const now = Date.now();
  if (options?.reSurfaced && monitoringStartedAt > 0 && now - monitoringStartedAt < STARTUP_GRACE_MS) {
    return false;
  }
  if (
    lastPresentedMissionId === missionId &&
    now - lastPresentedAt < PRESENT_DEBOUNCE_MS
  ) {
    return false;
  }
  lastPresentedMissionId = missionId;
  lastPresentedAt = now;
  return true;
}
