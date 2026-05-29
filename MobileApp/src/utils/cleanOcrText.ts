/**
 * Strip common social-app UI chrome from OCR text before keyword matching.
 * Raw ML Kit output is kept for logging; use cleanOcrText() for analysis.
 */

const UI_PHRASES: readonly string[] = [
  'liked by',
  'see translation',
  'view all comments',
  'add a comment',
  'add a story',
  'add story',
  'ask meta ai',
  'ask meta al',
  'view profile',
  'send message',
  'active now',
  'typing',
  'online',
  'suggested for you',
  'your story',
  'view insights',
  'share to',
  'write a comment',
];

/** Status-bar / in-app clock (e.g. 4:18, 3:51 PM). */
const TIMESTAMP_RE = /\b\d{1,2}:\d{2}\s?(?:AM|PM|am|pm)?\b/g;

/** Like / view counts (308K, 23.5K, 1.2M). */
const COUNT_SUFFIX_RE = /\b\d+(?:\.\d+)?[KkMm]\b/g;

/** Battery / signal noise sometimes OCR'd from the status bar. */
const STATUS_BAR_NOISE_RE = /\b(?:LTE|5G|4G|3G|WiFi|Wi-Fi)\b/gi;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove Instagram / Facebook / Messenger UI strings and numeric chrome
 * before keyword filtering.
 */
export function cleanOcrText(rawText: string): string {
  if (!rawText) return '';

  let text = rawText;

  for (const phrase of UI_PHRASES) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi'), ' ');
  }

  text = text
    .replace(TIMESTAMP_RE, ' ')
    .replace(COUNT_SUFFIX_RE, ' ')
    .replace(STATUS_BAR_NOISE_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}
