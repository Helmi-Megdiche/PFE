/**
 * Pauses periodic screen capture while a blocking mission (overlay or MissionScreen) is active.
 */

import { scLog } from './screenCaptureLogger';

type CaptureControl = () => void | Promise<void>;

let pauseCaptureFn: CaptureControl | null = null;
let resumeCaptureFn: CaptureControl | null = null;
let sessionDepth = 0;

export function registerMissionCaptureHandlers(
  pause: CaptureControl,
  resume: CaptureControl,
): void {
  pauseCaptureFn = pause;
  resumeCaptureFn = resume;
}

export function unregisterMissionCaptureHandlers(): void {
  pauseCaptureFn = null;
  resumeCaptureFn = null;
}

export function isMissionCapturePaused(): boolean {
  return sessionDepth > 0;
}

export function beginMissionCaptureSession(): void {
  sessionDepth += 1;
  scLog('Mission capture session begin', { sessionDepth });
  if (sessionDepth === 1) {
    void pauseCaptureFn?.();
  }
}

export function endMissionCaptureSession(): void {
  if (sessionDepth <= 0) {
    return;
  }
  sessionDepth -= 1;
  if (sessionDepth === 0) {
    void resumeCaptureFn?.();
  }
}

/** Always resume capture when a mission flow ends (handles nested begin calls). */
export function forceEndMissionCaptureSession(): void {
  if (sessionDepth <= 0) {
    return;
  }
  scLog('Mission capture session force end', { sessionDepth });
  sessionDepth = 0;
  void resumeCaptureFn?.();
}

/** Clears a stuck session (e.g. monitoring toggled off mid-mission). Does not resume native capture. */
export function resetMissionCaptureSession(): void {
  sessionDepth = 0;
}
