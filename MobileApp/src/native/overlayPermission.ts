import { Alert, Linking, NativeModules, Platform } from 'react-native';

interface OverlayPermissionNativeModule {
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showMissionNotification(
    missionId: string,
    title: string,
    description: string,
    points: number,
    missionType: string,
    metadataJson: string,
  ): Promise<boolean>;
  getPendingNotificationMission(): Promise<PendingNotificationMission | null>;
}

export interface PendingNotificationMission {
  missionId: string;
  title: string;
  description: string;
  points: number;
  missionType: string;
  metadataJson: string;
}

function getModule(): OverlayPermissionNativeModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return (NativeModules.OverlayPermission as OverlayPermissionNativeModule | undefined) ?? null;
}

export async function hasOverlayPermission(): Promise<boolean> {
  const mod = getModule();
  if (!mod) {
    return false;
  }
  try {
    return await mod.hasOverlayPermission();
  } catch {
    return false;
  }
}

export async function requestOverlayPermission(): Promise<void> {
  const mod = getModule();
  if (mod) {
    try {
      await mod.requestOverlayPermission();
      return;
    } catch {
      // fall through
    }
  }
  await Linking.openSettings();
}

export async function showMissionNotification(params: {
  missionId: string;
  title: string;
  description: string;
  points: number;
  missionType: string;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const mod = getModule();
  if (!mod) {
    return;
  }
  await mod.showMissionNotification(
    params.missionId,
    params.title,
    params.description,
    params.points,
    params.missionType,
    JSON.stringify(params.metadata ?? {}),
  );
}

export async function consumePendingNotificationMission(): Promise<PendingNotificationMission | null> {
  const mod = getModule();
  if (!mod) {
    return null;
  }
  try {
    return await mod.getPendingNotificationMission();
  } catch {
    return null;
  }
}

let overlayPromptShownThisSession = false;

/**
 * One-time dialog explaining draw-over permission (call on app start in dev).
 */
export async function promptOverlayPermissionIfNeeded(): Promise<void> {
  if (Platform.OS !== 'android' || overlayPromptShownThisSession) {
    return;
  }
  const granted = await hasOverlayPermission();
  if (granted) {
    return;
  }
  overlayPromptShownThisSession = true;
  Alert.alert(
    'Display over other apps',
    'To block Instagram and other apps with a mission screen immediately after risky content is detected, allow "Display over other apps" for this app in the next screen.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: () => void requestOverlayPermission() },
    ],
  );
}
