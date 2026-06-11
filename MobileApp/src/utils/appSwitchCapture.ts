import { isLauncherPackage } from './appCapturePolicy';

/** React Native applicationId — UsageStats excludes this package when we are foreground. */
export const APP_OWN_PACKAGE = 'com.mobileapp';

const SYSTEM_UI_PACKAGE = 'com.android.systemui';

export function isUsableTrackedPackage(pkg: string | null | undefined): pkg is string {
  if (!pkg || pkg === 'unknown' || pkg === SYSTEM_UI_PACKAGE) {
    return false;
  }
  if (pkg.includes('launcher')) {
    return false;
  }
  return true;
}

/**
 * Foreground package for app-switch detection.
 * While SafeGuard is active, UsageStats returns the app behind us — treat self as foreground.
 */
export function resolveEffectiveForegroundForSwitch(
  appState: string,
  usageStatsPackage: string,
): string | null {
  if (appState === 'active') {
    return APP_OWN_PACKAGE;
  }
  if (isUsableTrackedPackage(usageStatsPackage)) {
    return usageStatsPackage;
  }
  return null;
}

/** True when the child returned to the same app after a brief launcher visit. */
export function shouldCaptureAfterLauncherReturn(
  visitedLauncher: boolean,
  previousPkg: string | null,
  nextPkg: string,
): boolean {
  return (
    visitedLauncher &&
    previousPkg !== null &&
    nextPkg === previousPkg &&
    !isLauncherPackage(nextPkg)
  );
}
