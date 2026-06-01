import { applyRiskySearchBoost, isRiskyWebSearchContext } from '../src/utils/riskySearchContext';
import { keywordFilter } from '../src/utils/keywordFilter';

describe('riskySearchContext', () => {
  it('detects explicit google search queries', () => {
    const text = 'BASIC Mode IA Tous Images nsfw assir google.com/sear';
    expect(isRiskyWebSearchContext(text)).toBe(true);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(true);
    expect(result.category).toBe('adult');
  });

  it('does not boost Fiverr SafeSearch settings UI', () => {
    const text = 'Fiverr SafeSearch Désactiver nsfw Dessiner un personnage';
    expect(isRiskyWebSearchContext(text)).toBe(false);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
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
