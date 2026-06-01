import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform, ToastAndroid } from 'react-native';
import {
  flushPendingOverlayEvents,
  getOverlayMissionEmitter,
  hideMissionOverlay,
  OVERLAY_MISSION_EVENTS,
  type OverlayMissionActionEvent,
} from '../native/OverlayMission';
import { executeMissionAction } from '../missions/missionCompletion';
import {
  consumePendingNotificationMission,
  promptOverlayPermissionIfNeeded,
} from '../native/overlayPermission';
import { navigateToMissionScreen } from '../navigation/navigationRef';
import { scError, scLog } from '../utils/screenCaptureLogger';

function showBriefMessage(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.LONG);
  } else {
    Alert.alert('Mission', message);
  }
}

async function handleOverlayAction(event: OverlayMissionActionEvent): Promise<void> {
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(event.metadataJson || '{}') as Record<string, unknown>;
  } catch {
    metadata = {};
  }

  scLog('Overlay mission action', event);

  if (event.action === 'start') {
    await hideMissionOverlay();
    navigateToMissionScreen({
      missionId: event.missionId,
      title: String(metadata.overlayTitle ?? 'Mission'),
      description: String(metadata.overlayDescription ?? ''),
      points: Number(metadata.overlayPoints ?? 0),
      missionType: event.missionType,
      metadata,
    });
    return;
  }

  try {
    const result = await executeMissionAction(
      event.missionId,
      event.missionType,
      metadata,
      event.action,
    );
    await hideMissionOverlay();
    showBriefMessage(result.message);
  } catch (err) {
    await hideMissionOverlay();
    const message = err instanceof Error ? err.message : String(err);
    scError('Overlay mission action failed', err);
    showBriefMessage(`Mission failed: ${message}`);
  }
}

function openMissionFromNotification(pending: {
  missionId: string;
  title: string;
  description: string;
  points: number;
  missionType: string;
  metadataJson: string;
}): void {
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
 * Listens for native overlay button events and notification tap launches.
 */
export function useMissionOverlayListener(): void {
  const handlingRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    void promptOverlayPermissionIfNeeded();

    void consumePendingNotificationMission().then((pending) => {
      if (pending?.missionId) {
        scLog('Opening mission from notification tap', pending.missionId);
        openMissionFromNotification(pending);
      }
    });

    const emitter = getOverlayMissionEmitter();
    if (!emitter) {
      return;
    }

    const sub = emitter.addListener(
      OVERLAY_MISSION_EVENTS.MISSION_ACTION,
      (event: OverlayMissionActionEvent) => {
        if (handlingRef.current) {
          return;
        }
        handlingRef.current = true;
        void handleOverlayAction(event).finally(() => {
          handlingRef.current = false;
        });
      },
    );

    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void flushPendingOverlayEvents();
      }
    });

    return () => {
      sub.remove();
      appStateSub.remove();
    };
  }, []);
}
