/**
 * Pauses periodic screen capture while a blocking mission (overlay or MissionScreen) is active.
 */

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

/** Clears a stuck session (e.g. monitoring toggled off mid-mission). Does not resume native capture. */
export function resetMissionCaptureSession(): void {
  sessionDepth = 0;
}
