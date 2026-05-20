/**
 * Detect React Native / Metro dev UI text in OCR output (false positives in __DEV__).
 */

const DEV_OVERLAY_MARKERS = [
  'react native',
  'metro',
  'console error',
  'console warn',
  'dev menu',
  'screen capture',
  'screencapture',
  'on-device ocr',
  'nsfw tflite debug',
  'devtools',
  'logbox',
  'hermes',
  'fast refresh',
  'reload js',
];

export function isDevOverlayOcrText(text: string): boolean {
  if (!text?.trim()) {
    return false;
  }
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const marker of DEV_OVERLAY_MARKERS) {
    if (haystack.includes(marker)) {
      hits += 1;
    }
  }
  return hits >= 2 || (hits >= 1 && haystack.includes('console'));
}
