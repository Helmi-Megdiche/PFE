import { findAdultSiteMatches, isAdultSiteUrlContext } from '../src/utils/adultSiteContext';
import { keywordFilter } from '../src/utils/keywordFilter';

describe('adultSiteContext', () => {
  it('detects pornhub.com in garbled Chrome address bar OCR', () => {
    const text = '2% pornhub.com/vi + V 92)4';
    expect(isAdultSiteUrlContext(text)).toBe(true);
    expect(findAdultSiteMatches(text)).toContain('pornhub');
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(true);
    expect(result.category).toBe('adult');
    expect(result.matchedKeywords).toContain('pornhub');
  });

  it('does not flag computer or unrelated words', () => {
    expect(isAdultSiteUrlContext('Tic-Tac-Toe Beat the computer')).toBe(false);
  });

  it('detects xvideos hostname', () => {
    expect(isAdultSiteUrlContext('https://www.xvideos.com/video123')).toBe(true);
  });
});
