import { findAdultSiteMatches, isAdultSiteUrlContext } from './adultSiteContext';
import type { KeywordFilterResult } from './keywordFilter';

const SEARCH_HOST_RE =
  /\b(google\.com\/search|google\.com\/sear|bing\.com\/search|duckduckgo\.com)\b/i;

const ADULT_EXPLICIT_QUERY_RE = /\b(nsfw|porn|xxx|nude|hentai|sex\s*tape)\b/i;

const VIOLENT_EXPLICIT_QUERY_RE =
  /\b(gore|gory|blood|murder|kill|massacre|behead|dismember|mutilation|corpse|brutal|shooting|school\s*shooting)\b/i;

/** Chrome / Google search-box OCR (e.g. "+ Q porn", "Q gore") — not body result titles. */
const ADULT_SEARCH_BOX_QUERY_RE =
  /(?:^|[\s+])q\s+(?:nsfw|porn|xxx|nude|hentai|sex\s*tape)\b/i;

const VIOLENT_SEARCH_BOX_QUERY_RE =
  /(?:^|[\s+])q\s+(?:gore|gory|blood|murder|kill|massacre|behead|dismember|mutilation|corpse|brutal|shooting|school\s*shooting)\b/i;

export function hasExplicitSearchBoxQuery(text: string): boolean {
  const lower = text.toLowerCase();
  return ADULT_SEARCH_BOX_QUERY_RE.test(lower) || VIOLENT_SEARCH_BOX_QUERY_RE.test(lower);
}

/** SafeSearch / censored filter UI on a search results page — not an active explicit search. */
export function isFilteredSearchResultsContext(lower: string): boolean {
  if (!SEARCH_HOST_RE.test(lower)) {
    return false;
  }
  const hasFilterUi = /\b(censored|safe\s*search|filtered|family\s*filter|restricted\s*mode|flouter|mode\s*ia|flou|recherche\s*sécurisée|recherche\s*securisee)\b/i.test(
    lower,
  );
  if (!hasFilterUi) {
    return false;
  }
  return true;
}

/**
 * Cap combined risk on filtered SERPs when TFLite is low and the child did not
 * type an explicit query in the search box (body keywords like youporn are ignored).
 */
export function shouldCapFilteredSearchResults(text: string, tfliteScore: number): boolean {
  const lower = text.toLowerCase();
  return (
    isFilteredSearchResultsContext(lower) &&
    tfliteScore < 30 &&
    !hasExplicitSearchBoxQuery(lower)
  );
}

function isSearchHostContext(text: string): boolean {
  return SEARCH_HOST_RE.test(text.toLowerCase());
}

/** Browser search UI with an explicit adult query term. */
export function isRiskyAdultWebSearchContext(text: string): boolean {
  const lower = text.toLowerCase();
  if (isFilteredSearchResultsContext(lower)) {
    return isSearchHostContext(text) && ADULT_SEARCH_BOX_QUERY_RE.test(lower);
  }
  return isSearchHostContext(text) && ADULT_EXPLICIT_QUERY_RE.test(lower);
}

/** Browser search UI with violent / gore query terms (e.g. Google Images + gore). */
export function isRiskyViolentWebSearchContext(text: string): boolean {
  const lower = text.toLowerCase();
  if (isFilteredSearchResultsContext(lower)) {
    return isSearchHostContext(text) && VIOLENT_SEARCH_BOX_QUERY_RE.test(lower);
  }
  return isSearchHostContext(text) && VIOLENT_EXPLICIT_QUERY_RE.test(lower);
}

/** @deprecated Use isRiskyAdultWebSearchContext — kept for tests. */
export function isRiskyWebSearchContext(text: string): boolean {
  return isRiskyAdultWebSearchContext(text) || isRiskyViolentWebSearchContext(text);
}

/**
 * Boost keyword outcome when the child is searching for explicit or violent terms.
 */
export function applyRiskySearchBoost(
  text: string,
  result: KeywordFilterResult,
): KeywordFilterResult {
  const matched = new Set(result.matchedKeywords.map((k) => k.toLowerCase()));

  if (isAdultSiteUrlContext(text)) {
    for (const site of findAdultSiteMatches(text)) {
      matched.add(site);
    }
    return {
      riskFlag: true,
      category: 'adult',
      matchedKeywords: [...matched],
    };
  }

  if (isRiskyAdultWebSearchContext(text)) {
    matched.add('nsfw');
    return {
      riskFlag: true,
      category: 'adult',
      matchedKeywords: [...matched],
    };
  }

  if (isRiskyViolentWebSearchContext(text)) {
    matched.add('gore');
    return {
      riskFlag: true,
      category: 'violent',
      matchedKeywords: [...matched],
    };
  }

  return result;
}
