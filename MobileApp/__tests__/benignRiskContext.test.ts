import {
  applyBenignKeywordContext,
  filterBenignKeywordMatches,
  shouldSkipScreenEventReporting,
} from '../src/utils/benignRiskContext';
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

  it('drops keywords on ACTIVE MISSION quiz overlay OCR', () => {
    const text =
      'ACTIVE MISSION Online Safety Quiz 44 points quiz Answer 3 questions about staying safe';
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
  });

  it('does not match pute inside computer', () => {
    expect(keywordFilter('Tic-Tac-Toe Beat the computer minigame').riskFlag).toBe(false);
  });

  it('skips screen event reporting for N-back mission UI OCR', () => {
    const text =
      'hssir Memory Challenge Play N-back (level 2) 45 points cognitive minigame';
    expect(shouldSkipScreenEventReporting(text)).toBe(true);
    expect(keywordFilter(text).riskFlag).toBe(false);
  });

  it('skips screen event reporting for SafeGuard monitor tab OCR', () => {
    const text =
      'Monitor Screen monitoring 9ssi On-device OCR and vision. Captures on app switch';
    expect(shouldSkipScreenEventReporting(text)).toBe(true);
  });

  it('drops adult keywords on Discord home-feed launcher OCR', () => {
    const text =
      'Friends online discord.gg/UQ5M3 You 4d ago Messages from server';
    const result = keywordFilter(text);
    expect(result.riskFlag).toBe(false);
    expect(result.category).toBe('neutral');
  });

  it('keeps nsfw when not parental-control context', () => {
    const text = 'watch free nsfw videos now';
    expect(filterBenignKeywordMatches(text, ['nsfw'])).toEqual(['nsfw']);
    expect(keywordFilter(text).category).toBe('adult');
  });
});
