import {
  analyzeText,
  findHighRiskKeywords,
  keywordFilter,
} from '../src/utils/keywordFilter';
import { normalizeArabizi } from '../src/utils/normalizeArabizi';

describe('keywordFilter — French', () => {
  it('flags French adult terms as adult', () => {
    const r = keywordFilter('je vais te baiser ce soir');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
    expect(r.matchedKeywords).toEqual(expect.arrayContaining(['baiser']));
  });

  it('flags French insults as adult (vulgar)', () => {
    const r = keywordFilter('quelle salope, putain');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
  });

  it('flags French violence keywords', () => {
    const r = keywordFilter('je vais te tuer avec un couteau');
    expect(r.riskFlag).toBe(true);
    expect(['violent', 'adult']).toContain(r.category);
  });

  it('keeps neutral text neutral', () => {
    const r = keywordFilter('Bonjour, comment vas-tu aujourd\'hui ?');
    expect(r.riskFlag).toBe(false);
    expect(r.category).toBe('neutral');
  });
});

describe('keywordFilter — Arabic script', () => {
  it('flags explicit Arabic terms as adult', () => {
    const r = keywordFilter('سكس مع كس');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
    expect(r.matchedKeywords.some((kw) => kw.includes('سكس'))).toBe(true);
  });

  it('flags Arabic violence terms', () => {
    const r = keywordFilter('سأقتل بسكين');
    expect(r.riskFlag).toBe(true);
    expect(['violent', 'adult']).toContain(r.category);
  });

  it('keeps polite Arabic neutral', () => {
    const r = keywordFilter('السلام عليكم ورحمة الله');
    expect(r.riskFlag).toBe(false);
    expect(r.category).toBe('neutral');
  });
});

describe('keywordFilter — Derja Arabizi (Latin + digits)', () => {
  it('flags "9a7ba" as adult', () => {
    const r = keywordFilter('hadhi 9a7ba');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
  });

  it('flags "nik" as adult via word boundary', () => {
    const r = keywordFilter('roho nik rouhek');
    expect(r.riskFlag).toBe(true);
    expect(r.category).toBe('adult');
  });

  it('does not falsely flag "nikon camera"', () => {
    const r = keywordFilter('I love my Nikon camera');
    expect(r.category).not.toBe('adult');
  });
});

describe('keywordFilter — normalized Arabizi text', () => {
  it('catches keywords from normalized form when raw form is hidden in digits', () => {
    const raw = 'cha9wa fil 7ay';
    const norm = normalizeArabizi(raw);
    const r = keywordFilter(raw, norm);
    expect(r.matchedKeywords).toEqual(expect.arrayContaining(['cha9wa']));
    expect(r.category).toBe('adult');
  });
});

describe('analyzeText (multilingual + risk score)', () => {
  it('returns adult >= 70 for French explicit text', () => {
    const r = analyzeText('porno baise sexe');
    expect(r.category).toBe('adult');
    expect(r.riskScore).toBeGreaterThanOrEqual(70);
  });

  it('returns low score for educational Arabic content', () => {
    const r = analyzeText('درس في الرياضيات');
    expect(r.category).toBe('educational');
    expect(r.riskScore).toBeLessThanOrEqual(20);
  });
});

describe('findHighRiskKeywords — multilingual', () => {
  it('detects mixed French + Arabic explicit text', () => {
    const hits = findHighRiskKeywords('baiser سكس nik');
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});
