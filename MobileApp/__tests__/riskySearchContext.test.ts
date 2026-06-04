import { applyRiskySearchBoost, isRiskyWebSearchContext, isRiskyViolentWebSearchContext } from '../src/utils/riskySearchContext';
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

  it('boosts violent google image search for gore', () => {
    const text = 'Mode IA Tous Images gore google.com/sear blood results';
    expect(isRiskyViolentWebSearchContext(text)).toBe(true);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(true);
    expect(result.category).toBe('violent');
    expect(result.matchedKeywords).toContain('gore');
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
