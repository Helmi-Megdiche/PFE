import { applyBenignKeywordContext, filterBenignKeywordMatches } from '../src/utils/benignRiskContext';
import { keywordFilter } from '../src/utils/keywordFilter';

describe('benignRiskContext', () => {
  it('drops nsfw/adult on Fiverr SafeSearch UI', () => {
    const text =
      'BASIC Fiverr SafeSearch Désactiver teNeues nsfw Dessiner un personnage';
    expect(filterBenignKeywordMatches(text, ['nsfw', 'adult'])).toEqual([]);
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
    expect(result.category).toBe('neutral');
  });

  it('drops adult keywords on parent gamification dashboard OCR', () => {
    const text =
      'Missions assir 10 pts completed real_world Bonus Points pending approval';
    const filtered = applyBenignKeywordContext(text, {
      riskFlag: true,
      category: 'adult',
      matchedKeywords: ['adult'],
    });
    expect(filtered.riskFlag).toBe(false);
    expect(filtered.matchedKeywords).toEqual([]);
  });

  it('keeps nsfw when not parental-control context', () => {
    const text = 'watch free nsfw videos now';
    expect(filterBenignKeywordMatches(text, ['nsfw'])).toEqual(['nsfw']);
    expect(keywordFilter(text).category).toBe('adult');
  });
});
