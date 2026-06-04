import { isLauncherPackage } from './appCapturePolicy';

/**
 * Home screen shows recent-app cards (Chrome thumbnail with pornhub URL, app tray icons).
 * OCR reads that bleed but UsageStats reports com.miui.home — not actionable as launcher risk.
 */
export function isLauncherRecentsWidgetContext(text: string): boolean {
  const lower = text.toLowerCase();
  const adultThumb =
    /\b(pornhub\.com|pornhub|step\s*sis|sislovesme|porn\s*hub|blowjob)\b/i.test(
      lower,
    );
  if (!adultThumb) {
    return false;
  }

  const chromeRecentsCard =
    /\bchrome\b/i.test(lower) &&
    (/\bpornhub\b/i.test(lower) || /\bstep\s*sis\b/i.test(lower));
  const appTrayIcons =
    /\b(facebook|instagram|gallery|google|whatsapp|tiktok|youtube)\b/i.test(
      lower,
    ) && /\b(chrome|pornhub)\b/i.test(lower);

  return chromeRecentsCard || appTrayIcons;
}

export function shouldNeutralizeLauncherWidgetCapture(
  packageName: string,
  text: string,
): boolean {
  return isLauncherPackage(packageName) && isLauncherRecentsWidgetContext(text);
}
