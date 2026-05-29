import {
  containsArabicScript,
  containsStrongArabizi,
  countTransformationDigits,
} from './normalizeArabizi';

/** Digit-led faux-words when ML Kit misreads Arabic as Latin (e.g. "9ssir", "C3"). */
const GARBLED_ARABIC_LATIN_RE = /[2356789][a-z]{2,}|[a-z][2356789](?=[a-z])/i;

/** ML Kit often drops the leading digit — e.g. "hssir" instead of "9ssir". */
const ML_KIT_ARABIC_GARBLE_RE = /\b[gh]?ss[i1l][r4]\b|\bbuay\b/i;

/** English UI/search hints that the page likely shows Arabic script ML Kit missed. */
const ARABIC_PAGE_HINT_RE = /\b(?:arabic|arabe|arabizi|calligraphy|scrittura)\b/i;

const MESSAGING_APP_PACKAGES = new Set([
  'com.facebook.orca',
  'com.facebook.katana',
  'com.facebook.lite',
  'com.instagram.android',
  'com.whatsapp',
  'org.telegram.messenger',
  'com.snapchat.android',
]);

export interface ArabicOcrTriggerOptions {
  appPackage?: string;
}

function isMessagingApp(appPackage?: string): boolean {
  return !!appPackage && MESSAGING_APP_PACKAGES.has(appPackage);
}

function looksLikeMlKitMisreadArabic(cleanedMlText: string): boolean {
  if (!cleanedMlText || containsArabicScript(cleanedMlText)) {
    return false;
  }
  if (ML_KIT_ARABIC_GARBLE_RE.test(cleanedMlText)) {
    return true;
  }
  if (containsStrongArabizi(cleanedMlText)) {
    return true;
  }
  return (
    countTransformationDigits(cleanedMlText) >= 2 &&
    GARBLED_ARABIC_LATIN_RE.test(cleanedMlText)
  );
}

function pageHintsArabicContent(text: string): boolean {
  if (!text || containsArabicScript(text)) {
    return false;
  }
  return ARABIC_PAGE_HINT_RE.test(text);
}

/**
 * True when on-device Tesseract should run after ML Kit.
 * ML Kit often misreads Arabic pages as Latin digits (e.g. "9ssir") with no Arabic Unicode.
 *
 * Messaging apps: Tesseract only when ML Kit already saw Arabic script (Latin Derja
 * stays on ML Kit + normalisation). Browser/content apps also use garbled-Latin heuristics.
 */
export function shouldAttemptOnDeviceArabicOcr(
  mlText: string,
  cleanedMlText: string,
  options?: ArabicOcrTriggerOptions,
): boolean {
  if (containsArabicScript(mlText) || containsArabicScript(cleanedMlText)) {
    return true;
  }

  if (isMessagingApp(options?.appPackage)) {
    return false;
  }

  if (
    pageHintsArabicContent(cleanedMlText) ||
    pageHintsArabicContent(mlText)
  ) {
    return true;
  }
  if (
    looksLikeMlKitMisreadArabic(cleanedMlText) ||
    looksLikeMlKitMisreadArabic(mlText)
  ) {
    return true;
  }

  return false;
}
