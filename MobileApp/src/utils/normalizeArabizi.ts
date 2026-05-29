/**
 * Arabizi (Tunisian Derja Latin-script with digits) normalization helpers.
 * Arabic replacement chars use \\u escapes so Hermes/Metro always parse this file.
 */

/** Arabic Unicode block (basic + extended A/B + presentation forms). */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Arabizi pattern: digit adjacent to a Latin letter (e.g. "3la", "9a7ba"). */
const ARABIZI_PATTERN_RE = /[a-z][2356789]|[2356789][a-z]/i;

/** Transformation digits used in Maghrebi Arabizi, only when letter-adjacent. */
const TRANSFORMATION_DIGIT_ADJACENT_RE = /(?<=[a-zA-Z])[2356789]|[2356789](?=[a-zA-Z])/g;

/** Digit-to-Arabic-letter mapping used in Maghrebi Arabizi. */
const DIGIT_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/7/g, '\u062D'],
  [/3/g, '\u0639'],
  [/2/g, '\u0621'],
  [/5/g, '\u062E'],
  [/6/g, '\u0637'],
  [/8/g, '\u0642'],
  [/9/g, '\u0642'],
];

/** Latin digraphs commonly used in Arabizi. */
const DIGRAPH_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/ch/gi, '\u0634'],
  [/kh/gi, '\u062E'],
  [/gh/gi, '\u063A'],
  [/th/gi, '\u062B'],
  [/dh/gi, '\u0630'],
  [/sh/gi, '\u0634'],
  [/ou/gi, '\u0648'],
];

export function containsArabicScript(text: string): boolean {
  return !!text && ARABIC_SCRIPT_RE.test(text);
}

export function containsArabiziPattern(text: string): boolean {
  return !!text && ARABIZI_PATTERN_RE.test(text);
}

/**
 * True when a token looks like UI chrome rather than Arabizi:
 * timestamps (3:51), like counts (308K), or long pure numbers (1010108).
 */
export function isLikelyUINumber(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^\d{1,2}:\d{2}(?:\s?(?:AM|PM|am|pm))?$/.test(t)) return true;
  if (/^(?:\d{2,}|\d+\.\d+)[KkMm]$/.test(t)) return true;
  if (/^\d{4,}$/.test(t)) return true;
  return false;
}

/** Count letter-adjacent transformation digits (excludes year digits, clock times). */
export function countTransformationDigits(text: string): number {
  if (!text) return 0;
  return text.match(TRANSFORMATION_DIGIT_ADJACENT_RE)?.length ?? 0;
}

/** Count digit-letter Arabizi tokens (excludes plain numbers like times/counts). */
export function countArabiziSignals(text: string): number {
  if (!text) return 0;
  const re = /[a-z][2356789]|[2356789][a-z]/gi;
  const matches = text.match(re);
  if (!matches) return 0;

  return matches.filter((token) => {
    const normalized = token.toLowerCase();
    return !isLikelyUINumber(normalized);
  }).length;
}

/** True when text is mostly numeric UI chrome (counts, timestamps) with few letters. */
export function isEntirelyNumericAfterStrippingLetters(text: string): boolean {
  const letterCount = (text.match(/[a-zA-Z\u0600-\u06FF]/g) ?? []).length;
  if (letterCount >= 3) return false;

  const withoutLetters = text.replace(/[a-zA-Z\u0600-\u06FF]/g, '').trim();
  if (!withoutLetters) return false;
  return /^[\d\s.,:+%\-/\\KkMm]+$/.test(withoutLetters);
}

/**
 * True when OCR text likely contains Arabic Unicode OR actionable Arabizi.
 * Excludes UI timestamps, like counts, and single-digit false positives.
 */
export function containsArabicOrArabizi(text: string): boolean {
  if (!text) return false;
  if (containsArabicScript(text)) return true;
  if (isLikelyUINumber(text)) return false;
  if (isEntirelyNumericAfterStrippingLetters(text)) return false;
  if (countTransformationDigits(text) < 2) return false;
  if (countArabiziSignals(text) < 2) return false;
  return containsArabiziPattern(text);
}

/**
 * Gate for Arabizi normalization — same criteria as containsArabicOrArabizi.
 * Reduces false positives from status-bar times and like counts (e.g. "3:51", "308K").
 */
export function containsStrongArabizi(text: string): boolean {
  return containsArabicOrArabizi(text);
}

/**
 * Conservative Arabizi → quasi-Arabic transliteration for keyword matching.
 */
export function normalizeArabizi(text: string): string {
  if (!text) return text;
  let out = text.toLowerCase();
  for (const [re, sub] of DIGRAPH_MAP) {
    out = out.replace(re, sub);
  }
  for (const [re, sub] of DIGIT_MAP) {
    out = out.replace(re, sub);
  }
  return out;
}
