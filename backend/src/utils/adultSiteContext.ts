/**
 * Known adult site hostnames in OCR / address bar (pornhub.com does not match \bporn\b).
 */

/** Substrings that indicate an explicit site URL or brand in screen OCR. */
export const ADULT_SITE_HOST_MARKERS: readonly string[] = [
  'pornhub.com',
  'pornhub.',
  'xvideos.com',
  'xvideos.',
  'xhamster.com',
  'xhamster.',
  'xnxx.com',
  'xnxx.',
  'redtube.com',
  'redtube.',
  'youporn.com',
  'youporn.',
  'spankbang.com',
  'spankbang.',
  'brazzers.com',
  'brazzers.',
  'chaturbate.com',
  'chaturbate.',
  'eporner.com',
  'eporner.',
  'tube8.com',
  'tube8.',
  'onlyfans.com',
  'onlyfans.',
];

const ADULT_SITE_BRAND_RE =
  /\b(?:pornhub|xvideos|xhamster|xnxx|redtube|youporn|spankbang|brazzers|chaturbate|eporner|tube8|onlyfans)(?:\.[a-z]{2,})?(?:\/|\b)/i;

export function findAdultSiteMatches(text: string): string[] {
  if (!text) {
    return [];
  }
  const lower = text.toLowerCase();
  const matched = new Set<string>();

  for (const marker of ADULT_SITE_HOST_MARKERS) {
    if (lower.includes(marker)) {
      matched.add(marker.split('.')[0] ?? marker);
    }
  }

  const brand = lower.match(ADULT_SITE_BRAND_RE);
  if (brand) {
    matched.add(brand[0].replace(/[./].*$/, '').toLowerCase());
  }

  return [...matched];
}

export function isAdultSiteUrlContext(text: string): boolean {
  return findAdultSiteMatches(text).length > 0;
}
