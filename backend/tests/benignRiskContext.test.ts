import { keywordFilter } from '../src/utils/keywordFilter';

describe('benignRiskContext', () => {
  it('does not flag Fiverr SafeSearch settings UI', () => {
    const text =
      'BASIC Fiverr SafeSearch Désactiver teNeues nsfw Dessiner un personnage';
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
    expect(result.category).toBe('neutral');
    expect(result.matchedKeywords).not.toContain('nsfw');
  });

  it('does not flag parent dashboard mission OCR', () => {
    const text =
      'Missions assir 10 pts completed real_world Bonus Points';
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
  });
});
