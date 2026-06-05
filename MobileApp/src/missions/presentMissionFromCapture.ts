import { Alert, Platform } from 'react-native';
import { navigateToMissionScreen } from '../navigation/navigationRef';
import { showMissionOverlay, isOverlayMissionAvailable } from '../native/OverlayMission';
import {
  hasOverlayPermission,
  requestOverlayPermission,
  showMissionNotification,
} from '../native/overlayPermission';
import { clearStaleNotificationMissionLaunch } from '../missions/missionNotificationLaunch';
import { beginMissionCaptureSession } from '../utils/missionCaptureSession';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

/** Set when presentation was blocked upstream (debounce); avoids duplicate notifications. */
export type PresentMissionOptions = { skipNotification?: boolean };

export interface PresentMissionParams {
  missionId: string;
  title: string;
  description: string;
  points: number;
  missionType: string;
  metadata: Record<string, unknown>;
}

/**
 * Shows a blocking mission UI after risky capture: overlay (preferred), else notification + in-app screen.
 */
function metadataForOverlay(params: PresentMissionParams): Record<string, unknown> {
  return {
    ...params.metadata,
    overlayTitle: params.title,
    overlayDescription: params.description,
    overlayPoints: params.points,
  };
}

export async function presentMissionFromCapture(
  params: PresentMissionParams,
  options?: PresentMissionOptions,
): Promise<void> {
  const overlayMetadata = metadataForOverlay(params);

  if (Platform.OS !== 'android' || !isOverlayMissionAvailable()) {
    beginMissionCaptureSession();
    navigateToMissionScreen({
      missionId: params.missionId,
      title: params.title,
      description: params.description,
      points: params.points,
      missionType: params.missionType,
      metadata: params.metadata,
    });
    return;
  }

  const canOverlay = await hasOverlayPermission();
  if (!canOverlay) {
    scWarn('Overlay permission not granted — notification + in-app fallback');
    beginMissionCaptureSession();
    await showMissionNotification(params);
    navigateToMissionScreen({
      missionId: params.missionId,
      title: params.title,
      description: params.description,
      points: params.points,
      missionType: params.missionType,
      metadata: params.metadata,
    });
    return;
  }

  try {
    await showMissionOverlay({ ...params, metadata: overlayMetadata });
    beginMissionCaptureSession();
    clearStaleNotificationMissionLaunch();
    scLog('Mission overlay shown', { missionId: params.missionId });
    if (!options?.skipNotification) {
      void showMissionNotification(params);
    }
  } catch (err) {
    scWarn('showMissionOverlay failed', err);
    beginMissionCaptureSession();
    await showMissionNotification(params);
    navigateToMissionScreen({
      missionId: params.missionId,
      title: params.title,
      description: params.description,
      points: params.points,
      missionType: params.missionType,
      metadata: params.metadata,
    });
  }
}

/** Call when overlay permission is missing but user should enable it for auto-block. */
export function promptEnableOverlayForMissions(): void {
  Alert.alert(
    'Enable display over other apps',
    'Allow this permission so missions appear on top of Instagram and other apps without opening SafeGuard first.',
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Open settings', onPress: () => void requestOverlayPermission() },
    ],
  );
}
