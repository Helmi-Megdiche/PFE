/**
 * Heuristics for screenshots that likely missed real on-screen content
 * (Incognito Chrome, DRM, black splash, etc.).
 */

export type CaptureQualityHint = 'ok' | 'blank_or_protected';

const BLANK_SCREEN_LABELS = ['sky', 'monochrome', 'space', 'darkness', 'night', 'black'];

export function detectCaptureQuality(
  mlKitLabels: Array<{ text: string; confidence: number }> | undefined,
  nsfwScore: number,
  ocrCharCount: number,
): CaptureQualityHint {
  if (!mlKitLabels?.length) {
    return 'ok';
  }
  const top = mlKitLabels.slice(0, 5).map((l) => l.text.toLowerCase());
  const blankHits = top.filter((t) => BLANK_SCREEN_LABELS.some((b) => t.includes(b))).length;
  if (blankHits >= 2 && nsfwScore < 0.2 && ocrCharCount < 20) {
    return 'blank_or_protected';
  }
  return 'ok';
}
