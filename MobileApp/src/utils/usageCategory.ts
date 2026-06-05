import { getAppCategory, isLauncherPackage, type AppCategory } from './appCapturePolicy';

const SYSTEM_UI_PACKAGE = 'com.android.systemui';
const APP_OWN_PACKAGE = 'com.mobileapp';

export function isTrackableForegroundPackage(packageName: string | null | undefined): packageName is string {
  if (!packageName || packageName === 'unknown') {
    return false;
  }
  if (packageName === SYSTEM_UI_PACKAGE || packageName === APP_OWN_PACKAGE) {
    return false;
  }
  if (isLauncherPackage(packageName) || packageName.includes('launcher')) {
    return false;
  }
  return true;
}

export function mapCategoryForUsage(packageName: string): string | null {
  const category = getAppCategory(packageName);
  return usageCategoryFromAppCategory(category);
}

function usageCategoryFromAppCategory(category: AppCategory): string | null {
  if (category === 'education') {
    return 'educational';
  }
  if (category === 'system') {
    return null;
  }
  return category;
}
