export type AppCategory = 'browser_social' | 'game' | 'education' | 'system' | 'default';

const BROWSER_SOCIAL_PACKAGES = new Set([
  'com.android.chrome',
  'com.google.android.apps.chrome',
  'com.instagram.android',
  'com.tiktok.android',
  'com.google.android.youtube',
  'com.whatsapp',
  'com.facebook.orca',
  'com.facebook.katana',
]);

const GAME_PACKAGES = new Set([
  'com.roblox.client',
  'com.mojang.minecraftpe',
  'com.supercell.clashofclans',
]);

const EDUCATION_PACKAGES = new Set([
  'org.khanacademy',
  'com.duolingo',
]);

const SYSTEM_PACKAGES = new Set([
  'com.android.launcher',
  'com.hihonor.android.launcher',
  'com.google.android.apps.nexuslauncher',
]);

export function getAppCategory(packageName: string): AppCategory {
  if (BROWSER_SOCIAL_PACKAGES.has(packageName)) {
    return 'browser_social';
  }
  if (GAME_PACKAGES.has(packageName)) {
    return 'game';
  }
  if (EDUCATION_PACKAGES.has(packageName)) {
    return 'education';
  }
  if (SYSTEM_PACKAGES.has(packageName)) {
    return 'system';
  }
  return 'default';
}

/**
 * Effective periodic interval (ms) from risk base interval and app category.
 * - browser_social: min(base, 30s)
 * - game / system: 0 (no JS periodic capture)
 * - education: max(base, 120s)
 * - default: base
 */
export function getEffectiveIntervalMs(
  baseRiskIntervalMs: number,
  appPackage: string,
): number {
  const category = getAppCategory(appPackage);
  switch (category) {
    case 'browser_social':
      return Math.min(baseRiskIntervalMs, 30_000);
    case 'game':
    case 'system':
      return 0;
    case 'education':
      return Math.max(baseRiskIntervalMs, 120_000);
    default:
      return baseRiskIntervalMs;
  }
}
