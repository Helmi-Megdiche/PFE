import { Linking, NativeModules, Platform } from 'react-native';
import { scLog, scWarn } from '../utils/screenCaptureLogger';

export interface ForegroundAppInfo {
  packageName: string;
  appLabel: string;
  lastTimeUsed?: number;
  source?: 'usage_stats' | 'activity_manager' | 'none';
}

interface ForegroundAppNativeModule {
  hasUsageAccess(): Promise<boolean>;
  hasUsageStatsPermission(): Promise<boolean>;
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

export async function hasUsageStatsPermission(): Promise<boolean> {
  return hasUsageAccess();
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

/**
 * Resolves foreground app — never throws; returns unknown if module missing.
 */
export async function resolveForegroundApp(): Promise<ForegroundAppInfo> {
  const mod = getModule();
  if (!mod) {
    scWarn('ForegroundApp module not linked');
    return { packageName: 'unknown', appLabel: 'unknown', source: 'none' };
  }

  try {
    const fg = await mod.getCurrentForegroundApp();
    if (fg?.packageName) {
      scLog('resolveForegroundApp', {
        package: fg.packageName,
        label: fg.appLabel,
        source: fg.source ?? 'usage_stats',
      });
      return {
        packageName: fg.packageName,
        appLabel: fg.appLabel ?? fg.packageName,
        lastTimeUsed: fg.lastTimeUsed,
        source: (fg.source as ForegroundAppInfo['source']) ?? 'usage_stats',
      };
    }
  } catch (err) {
    scWarn('resolveForegroundApp failed', err);
  }

  return { packageName: 'unknown', appLabel: 'unknown', source: 'none' };
}

/** @deprecated Prefer resolveForegroundApp() — does not throw when permission missing. */
export async function getCurrentForegroundApp(): Promise<ForegroundAppInfo | null> {
  const mod = getModule();
  if (!mod) {
    throw new Error(LINKING_ERROR);
  }
  return mod.getCurrentForegroundApp();
}
