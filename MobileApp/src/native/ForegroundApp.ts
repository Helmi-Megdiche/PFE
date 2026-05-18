import { Linking, NativeModules, Platform } from 'react-native';

export interface ForegroundAppInfo {
  packageName: string;
  appLabel: string;
  lastTimeUsed?: number;
}

interface ForegroundAppNativeModule {
  hasUsageAccess(): Promise<boolean>;
  openUsageAccessSettings(): Promise<boolean>;
  getCurrentForegroundApp(): Promise<ForegroundAppInfo | null>;
}

const LINKING_ERROR =
  'ForegroundApp native module is not linked. Rebuild the Android app after Sprint 3.5.';

function getModule(): ForegroundAppNativeModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return NativeModules.ForegroundApp as ForegroundAppNativeModule | undefined ?? null;
}

export async function hasUsageAccess(): Promise<boolean> {
  const mod = getModule();
  if (!mod) return false;
  try {
    return await mod.hasUsageAccess();
  } catch {
    return false;
  }
}

export async function openUsageAccessSettings(): Promise<void> {
  const mod = getModule();
  if (mod) {
    try {
      await mod.openUsageAccessSettings();
      return;
    } catch {
      // fall through
    }
  }
  await Linking.openSettings();
}

export async function getCurrentForegroundApp(): Promise<ForegroundAppInfo | null> {
  const mod = getModule();
  if (!mod) {
    throw new Error(LINKING_ERROR);
  }
  return mod.getCurrentForegroundApp();
}
