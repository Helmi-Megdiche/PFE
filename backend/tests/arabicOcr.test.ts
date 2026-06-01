import {
  analyzeText,
  analyzeTextForArabicOcr,
  containsArabicScript,
  findHighRiskKeywords,
  findHighRiskKeywordsForArabicOcr,
  isArabicPrimaryOcrText,
  keywordFilter,
} from '../src/utils/keywordFilter';

describe('Arabic OCR keyword path (Sprint 3.13)', () => {
  it('containsArabicScript detects Arabic Unicode', () => {
    expect(containsArabicScript('السلام عليكم')).toBe(true);
    expect(containsArabicScript('hello world')).toBe(false);
  });

  it('findHighRiskKeywords matches explicit Arabic terms', () => {
    expect(findHighRiskKeywords('هذا نص يحتوي على سكس')).toEqual(
      expect.arrayContaining(['سكس']),
    );
    expect(findHighRiskKeywords('كلمة قحبة في الجملة')).toEqual(
      expect.arrayContaining(['قحبة']),
    );
  });

  it('keywordFilter flags Arabic adult content', () => {
    const r = keywordFilter('محتوى للبالغين سكس');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
    expect(r.matchedKeywords).toContain('سكس');
  });

  it('analyzeText returns high risk score for Arabic explicit terms', () => {
    const analyzed = analyzeText('نص صريح سكس');
    expect(analyzed.riskFlag).toBe(true);
    expect(analyzed.category).toBe('adult');
    expect(analyzed.riskScore).toBeGreaterThanOrEqual(70);
    expect(analyzed.matchedKeywords).toContain('سكس');
  });

  it('analyzeText keeps polite Arabic neutral', () => {
    const analyzed = analyzeText('السلام عليكم ورحمة الله');
    expect(analyzed.riskFlag).toBe(false);
    expect(analyzed.category).toBe('neutral');
  });

  it('keywordFilter still matches Derja Arabizi on backend', () => {
    const r = keywordFilter('hayya 9a7ba w 3lik');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
    expect(r.matchedKeywords).toContain('9a7ba');
  });

  it('keywordFilter still matches French terms on backend', () => {
    const r = keywordFilter('quelle salope');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
    expect(r.matchedKeywords).toContain('salope');
  });

  it('analyzeText accepts optional normalizedText channel', () => {
    const analyzed = analyzeText('neutral latin text', '9a7ba w 3lik');
    expect(analyzed.riskFlag).toBe(true);
    expect(analyzed.category).toBe('adult');
  });

  it('does not flag short English OCR noise on Arabic-primary motivational text', () => {
    const noisy =
      'المبالغة في التواضع داخل بيئة\n' +
      'ass يظهر. اعرض Le يحكم\n' +
      'بذكاء، فالنيات لا تقرا.';
    expect(isArabicPrimaryOcrText(noisy)).toBe(true);
    expect(findHighRiskKeywordsForArabicOcr(noisy)).not.toContain('ass');
    const analyzed = analyzeTextForArabicOcr(noisy);
    expect(analyzed.riskFlag).toBe(false);
    expect(analyzed.category).toBe('neutral');
  });

  it('still flags explicit Arabic on Arabic-primary OCR text', () => {
    const analyzed = analyzeTextForArabicOcr('نص عربي صريح سكس في الجملة');
    expect(analyzed.riskFlag).toBe(true);
    expect(analyzed.category).toBe('adult');
    expect(analyzed.matchedKeywords).toContain('سكس');
  });
});
