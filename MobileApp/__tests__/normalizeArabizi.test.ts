import {
  containsArabicOrArabizi,
  containsArabicScript,
  containsArabiziPattern,
  containsStrongArabizi,
  countArabiziSignals,
  normalizeArabizi,
} from '../src/utils/normalizeArabizi';

describe('containsArabicScript', () => {
  it('detects Arabic Unicode characters', () => {
    expect(containsArabicScript('سكس')).toBe(true);
    expect(containsArabicScript('hello سلام world')).toBe(true);
  });

  it('returns false for plain Latin text', () => {
    expect(containsArabicScript('hello world')).toBe(false);
    expect(containsArabicScript('')).toBe(false);
  });
});

describe('containsArabiziPattern', () => {
  it('detects digit-letter mix typical of Arabizi', () => {
    expect(containsArabiziPattern('hayya 3la')).toBe(true);
    expect(containsArabiziPattern('9a7ba')).toBe(true);
    expect(containsArabiziPattern('s5oun')).toBe(true);
  });

  it('does not flag normal numbers next to spaces', () => {
    expect(containsArabiziPattern('the year is 2026')).toBe(false);
    expect(containsArabiziPattern('1 2 3')).toBe(false);
  });
});

describe('containsArabicOrArabizi', () => {
  it('true for either Arabic script or Arabizi pattern', () => {
    expect(containsArabicOrArabizi('سلام عليكم')).toBe(true);
    expect(containsArabicOrArabizi('3aslema')).toBe(true);
  });

  it('false for plain English', () => {
    expect(containsArabicOrArabizi('Hello world, 2026')).toBe(false);
  });
});

describe('containsStrongArabizi', () => {
  it('true for Arabic script', () => {
    expect(containsStrongArabizi('سلام')).toBe(true);
  });

  it('true when at least two digit-letter Arabizi tokens present', () => {
    expect(containsStrongArabizi('9a7ba w 3lik')).toBe(true);
  });

  it('false for single time-like token (3:51)', () => {
    expect(containsStrongArabizi('3:51 instagram feed')).toBe(false);
  });

  it('false for a single like-count token (308K)', () => {
    expect(countArabiziSignals('308K likes')).toBe(1);
    expect(containsStrongArabizi('308K likes')).toBe(false);
  });
});

describe('normalizeArabizi', () => {
  it('maps Arabizi digits to Arabic letters', () => {
    const n = normalizeArabizi('7obb 3lik');
    expect(n).toContain('ح');
    expect(n).toContain('ع');
  });

  it('lowercases and maps digraphs', () => {
    const n = normalizeArabizi('CHwaya kHla');
    expect(n).toContain('ش');
    expect(n).toContain('خ');
  });

  it('returns lowercased text when no Arabizi tokens present', () => {
    expect(normalizeArabizi('Hello World')).toBe('hello world');
  });

  it('handles empty input', () => {
    expect(normalizeArabizi('')).toBe('');
  });
});
