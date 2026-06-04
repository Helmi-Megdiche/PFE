import {
  clearPendingNotificationMission,
  consumePendingNotificationMission,
  type PendingNotificationMission,
} from '../native/overlayPermission';
import { navigateToMissionScreen } from '../navigation/navigationRef';
import { getMissionById } from '../services/missionsApi';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

let opening = false;

function navigateFromPending(pending: PendingNotificationMission): void {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(pending.metadataJson || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }
  navigateToMissionScreen({
    missionId: pending.missionId,
    title: pending.title,
    description: pending.description,
    points: pending.points,
    missionType: pending.missionType,
    metadata,
  });
}

/**
 * Consume a notification-tap mission launch once, only if the mission is still pending on the server.
 * Prevents Metro reload from reopening missions that were already completed via overlay or in-app.
 */
export async function tryOpenPendingNotificationMission(): Promise<void> {
  if (opening) {
    return;
  }
  opening = true;
  try {
    const pending = await consumePendingNotificationMission();
    if (!pending?.missionId) {
      return;
    }

    let mission;
    try {
      mission = await getMissionById(pending.missionId);
    } catch {
      scWarn('Notification mission could not be verified — skipping launch', {
        missionId: pending.missionId,
      });
      return;
    }

    if (mission.status !== 'pending') {
      scLog('Skipping stale notification mission', {
        missionId: pending.missionId,
        status: mission.status,
      });
      return;
    }

    scLog('Opening mission from notification tap', pending.missionId);
    navigateFromPending(pending);
  } finally {
    opening = false;
  }
}

/** Drop queued notification extras after overlay or in-app mission takes over. */
export function clearStaleNotificationMissionLaunch(): void {
  void clearPendingNotificationMission();
}
