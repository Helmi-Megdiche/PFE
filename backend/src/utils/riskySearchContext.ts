import type { KeywordFilterResult } from './keywordFilter';

const SEARCH_HOST_RE =
  /\b(google\.com\/search|google\.com\/sear|bing\.com\/search|duckduckgo\.com)\b/i;

const EXPLICIT_QUERY_RE = /\b(nsfw|porn|xxx|nude|hentai|sex\s*tape)\b/i;

export function isRiskyWebSearchContext(text: string): boolean {
  const lower = text.toLowerCase();
  return SEARCH_HOST_RE.test(lower) && EXPLICIT_QUERY_RE.test(lower);
}

export function applyRiskySearchBoost(
  text: string,
  result: KeywordFilterResult,
): KeywordFilterResult {
  if (!isRiskyWebSearchContext(text)) {
    return result;
  }
  const matched = new Set(result.matchedKeywords.map((k) => k.toLowerCase()));
  matched.add('nsfw');
  return {
    riskFlag: true,
    category: 'adult',
    matchedKeywords: [...matched],
  };
}
