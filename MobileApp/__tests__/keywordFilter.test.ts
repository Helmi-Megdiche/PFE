import { analyzeText, findHighRiskKeywords, keywordFilter } from '../src/utils/keywordFilter';
import { computeOcrRiskScore } from '../src/utils/riskCombination';

describe('keywordFilter explicit content', () => {
  it('matches porn and sex in broken OCR fragments', () => {
    const text = 'og | i Porn [__] Ade 1 sex';
    expect(findHighRiskKeywords(text)).toEqual(expect.arrayContaining(['porn', 'sex']));
    const result = keywordFilter(text);
    expect(result.category).toBe('adult');
    expect(result.riskFlag).toBe(true);
  });

  it('does not match ass inside unrelated words like assir', () => {
    const result = keywordFilter('9:02 assir 25 google.com/search');
    expect(result.category).not.toBe('adult');
  });

  it('scores adult OCR at least 70', () => {
    const result = keywordFilter('XXX Porn Adult');
    const score = computeOcrRiskScore(
      result.riskFlag,
      result.category,
      result.matchedKeywords.length,
    );
    expect(score).toBeGreaterThanOrEqual(70);
  });
});
