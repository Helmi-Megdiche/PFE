/**
 * Arabizi (Tunisian Derja Latin-script with digits) normalization helpers.
 * Keep transforms conservative to avoid mangling English/French.
 */

/** Arabic Unicode block (basic + extended A/B + presentation forms). */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/** Arabizi pattern: digit adjacent to a Latin letter (e.g. "3la", "9a7ba"). */
const ARABIZI_PATTERN_RE = /[a-z][2356789]|[2356789][a-z]/i;

/** Digit-to-Arabic-letter mapping used in Maghrebi Arabizi. */
const DIGIT_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/7/g, 'ح'],
  [/3/g, 'ع'],
  [/2/g, 'ء'],
  [/5/g, 'خ'],
  [/6/g, 'ط'],
  [/8/g, 'ق'],
  [/9/g, 'ق'],
];

/** Latin digraphs commonly used in Arabizi. */
const DIGRAPH_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/ch/gi, 'ش'],
  [/kh/gi, 'خ'],
  [/gh/gi, 'غ'],
  [/th/gi, 'ث'],
  [/dh/gi, 'ذ'],
  [/sh/gi, 'ش'],
  [/ou/gi, 'و'],
];

export function containsArabicScript(text: string): boolean {
  return !!text && ARABIC_SCRIPT_RE.test(text);
}

export function containsArabiziPattern(text: string): boolean {
  return !!text && ARABIZI_PATTERN_RE.test(text);
}

/** True when OCR text likely contains Arabic Unicode OR Arabizi-style digit-letter mix. */
export function containsArabicOrArabizi(text: string): boolean {
  if (!text) return false;
  if (containsArabicScript(text)) return true;
  return containsArabiziPattern(text);
}

/**
 * Conservative Arabizi → quasi-Arabic transliteration for keyword matching.
 * - Lowercases the input.
 * - Maps digits {2,3,5,6,7,8,9} to closest Arabic letters.
 * - Maps common digraphs (ch, kh, gh, th, dh, sh, ou).
 *
 * The output is **not** valid Arabic; it just produces tokens that can be
 * matched against keyword lists (e.g. `9a7ba` → `قاحبا` partial overlap with `قحبة`).
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
