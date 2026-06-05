import {
  applyRiskySearchBoost,
  hasExplicitSearchBoxQuery,
  isFilteredSearchResultsContext,
  isRiskyWebSearchContext,
  isRiskyViolentWebSearchContext,
  shouldCapFilteredSearchResults,
} from '../src/utils/riskySearchContext';
import { keywordFilter } from '../src/utils/keywordFilter';

describe('riskySearchContext', () => {
  it('detects explicit google search queries in the search box on filtered SERP', () => {
    const text = 'BASIC + Q nsfw Mode IA Tous Images google.com/sear';
    expect(isRiskyWebSearchContext(text)).toBe(true);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(true);
    expect(result.category).toBe('adult');
  });

  it('does not treat body-only nsfw on Mode IA SERP as explicit search', () => {
    const text = 'BASIC Mode IA Tous Images nsfw assir google.com/sear';
    expect(isRiskyWebSearchContext(text)).toBe(false);
    expect(shouldCapFilteredSearchResults(text, 4)).toBe(true);
  });

  it('does not boost Fiverr SafeSearch settings UI', () => {
    const text = 'Fiverr SafeSearch Désactiver nsfw Dessiner un personnage';
    expect(isRiskyWebSearchContext(text)).toBe(false);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
  });

  it('does not flag Fiverr character-design gigs on Google search (nsfw filter label)', () => {
    const text =
      '8:470 G BASIC Dessiner un personnage teNeues nsfw 25 google.com/sear STANDARD EXCLUSIVE';
    expect(isRiskyWebSearchContext(text)).toBe(true);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
    expect(result.category).toBe('neutral');
  });

  it('does not boost censored Google search filter UI', () => {
    const text = '7:28O hssi 25 google.com/sear Instagram CENSORED SJ0';
    expect(isRiskyWebSearchContext(text)).toBe(false);
    expect(keywordFilter(text).riskFlag).toBe(false);
  });

  it('boosts violent google image search when gore is in the search box', () => {
    const text = 'Mode IA Tous Images + Q gore google.com/sear blood results';
    expect(isRiskyViolentWebSearchContext(text)).toBe(true);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(true);
    expect(result.category).toBe('violent');
    expect(result.matchedKeywords).toContain('gore');
  });

  it('caps Mode IA SERP when body has porn keywords but search box does not', () => {
    const text =
      '14:00 google.com/sear Mode IA Tous Images youporn porno streaming titles';
    expect(isFilteredSearchResultsContext(text.toLowerCase())).toBe(true);
    expect(hasExplicitSearchBoxQuery(text)).toBe(false);
    expect(shouldCapFilteredSearchResults(text, 4)).toBe(true);
  });

  it('does not cap filtered SERP when search box has explicit Q porn query', () => {
    const text = 'google.com/sear + Q porn Mode IA Flouter censored results';
    expect(hasExplicitSearchBoxQuery(text)).toBe(true);
    expect(shouldCapFilteredSearchResults(text, 4)).toBe(false);
  });

  it('applyRiskySearchBoost forces adult when search context matches', () => {
    const boosted = applyRiskySearchBoost(
      'google.com/search?q=nsfw',
      { riskFlag: false, category: 'neutral', matchedKeywords: [] },
    );
    expect(boosted.category).toBe('adult');
    expect(boosted.matchedKeywords).toContain('nsfw');
  });
});
