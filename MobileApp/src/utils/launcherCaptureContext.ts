import { isLauncherPackage } from './appCapturePolicy';
import {
  isFullBrowserSearchContext,
  isInstagramFeedContext,
  isMessengerChatContext,
} from './inferAppPackageFromOcr';

/**
 * Tiny home-screen recents thumbnail only (short bleed text), not a full in-app screen.
 */
export function isLauncherRecentsWidgetContext(text: string): boolean {
  if (text.length > 220) {
    return false;
  }
  if (
    isMessengerChatContext(text) ||
    isFullBrowserSearchContext(text) ||
    isInstagramFeedContext(text)
  ) {
    return false;
  }

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
    lower.length < 160 &&
    /\b(facebook|instagram|gallery|google|whatsapp|tiktok|youtube)\b/i.test(
      lower,
    ) &&
    /\b(chrome|pornhub)\b/i.test(lower);

  return chromeRecentsCard || appTrayIcons;
}

export function shouldNeutralizeLauncherWidgetCapture(
  packageName: string,
  text: string,
): boolean {
  if (!isLauncherPackage(packageName)) {
    return false;
  }
  if (
    isMessengerChatContext(text) ||
    isFullBrowserSearchContext(text) ||
    isInstagramFeedContext(text)
  ) {
    return false;
  }
  return isLauncherRecentsWidgetContext(text);
}
