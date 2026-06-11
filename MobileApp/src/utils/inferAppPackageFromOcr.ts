/**
 * MIUI/HyperOS often reports com.miui.home while the screenshot shows another app
 * (recents card, app switcher, or stale UsageStats). Infer the real app from OCR.
 */

import { APP_OWN_PACKAGE } from './appSwitchCapture';
import { isLauncherPackage } from './appCapturePolicy';

export const INFERRED_PACKAGES = {
  messenger: 'com.facebook.orca',
  chrome: 'com.android.chrome',
  instagram: 'com.instagram.android',
} as const;

const SOCIAL_PACKAGES = new Set<string>([
  INFERRED_PACKAGES.messenger,
  INFERRED_PACKAGES.instagram,
]);

/** Messenger home inbox — search bar, stories, chat list (no active thread header). */
export function isMessengerInboxContext(text: string): boolean {
  const lower = text.toLowerCase();
  if (!/\bmessenger\b/i.test(lower)) {
    return false;
  }
  return (
    /\b(q\s+or\s+search|post\s+a\s+note|create\s+story)\b/i.test(lower) ||
    /\bchats?\b/i.test(lower)
  );
}

/** Messenger thread UI: "Active 52 minutes ago", chat bubbles, etc. */
export function isMessengerChatContext(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.length < 60) {
    return false;
  }
  const activeThread = /active\s+\d+\s*(minute|minut|hour|h|ago)/i.test(lower);
  const chatUi =
    /\b(message|messag|messenger|sent|delivered|typing)\b/i.test(lower) ||
    /\b(rayen|sahbi|khouya)\b/i.test(lower);
  return activeThread && (chatUi || lower.length > 120);
}

/** Full in-app browser / Google search results — not a tiny recents thumbnail. */
export function isFullBrowserSearchContext(text: string): boolean {
  const lower = text.toLowerCase();
  const browserChrome =
    /google\.com/i.test(lower) ||
    /https?:\/\//i.test(lower) ||
    /\b(mode\s*ia|tous\s*images|images|vidéos|videos|recherche|search)\b/i.test(lower);
  const adultQuery =
    /\b(porn|xxx|sex|pornhub|xnxx|porno|pussy|adult|nsfw)\b/i.test(lower);
  return browserChrome && adultQuery && lower.length > 40;
}

/** Prefer OCR inference over stale UsageStats / foreground cache. */
export function shouldOverridePackageWithOcrInference(
  resolvedPackage: string,
  inferredPackage: string,
  text: string,
): boolean {
  if (!inferredPackage || inferredPackage === resolvedPackage) {
    return false;
  }
  if (isLauncherPackage(resolvedPackage)) {
    return true;
  }
  if (
    resolvedPackage === APP_OWN_PACKAGE &&
    (inferredPackage === INFERRED_PACKAGES.messenger ||
      inferredPackage === INFERRED_PACKAGES.chrome ||
      inferredPackage === INFERRED_PACKAGES.instagram)
  ) {
    return true;
  }
  if (
    SOCIAL_PACKAGES.has(resolvedPackage) &&
    inferredPackage === INFERRED_PACKAGES.chrome &&
    isFullBrowserSearchContext(text)
  ) {
    return true;
  }
  if (
    resolvedPackage === INFERRED_PACKAGES.chrome &&
    inferredPackage === INFERRED_PACKAGES.messenger &&
    isMessengerChatContext(text)
  ) {
    return true;
  }
  if (
    resolvedPackage === INFERRED_PACKAGES.messenger &&
    inferredPackage === INFERRED_PACKAGES.instagram &&
    isInstagramFeedContext(text)
  ) {
    return true;
  }
  return false;
}

export function isInstagramFeedContext(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\binstagram\b/i.test(lower) ||
    (/\b(reels|followers|following|likes)\b/i.test(lower) && /\b(ago|days)\b/i.test(lower))
  );
}

/**
 * When UsageStats says launcher/home, guess the app actually visible in the capture.
 */
export function inferAppPackageFromOcr(text: string): string | null {
  // Browser SERP wins over stale Messenger cache when both patterns appear.
  if (isFullBrowserSearchContext(text)) {
    return INFERRED_PACKAGES.chrome;
  }
  if (isMessengerInboxContext(text) || isMessengerChatContext(text)) {
    return INFERRED_PACKAGES.messenger;
  }
  if (isInstagramFeedContext(text)) {
    return INFERRED_PACKAGES.instagram;
  }
  return null;
}
