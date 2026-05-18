import {
  mapMlKitLabelsToRisk,
  riskMappingToImageScores,
  toApiCategory,
} from '../src/utils/riskMapping';
import {
  enforceCategoryConsistency,
  resolveFinalCategoryWithScore,
} from '../src/utils/riskCombination';

describe('riskMapping (mobile)', () => {
  it('flags skin+muscle+hand as adult risk', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Skin', confidence: 0.93 },
      { label: 'Hand', confidence: 0.93 },
      { label: 'Muscle', confidence: 0.91 },
    ]);
    expect(mapped.category).toBe('adult');
    expect(mapped.riskScore).toBeGreaterThan(60);
    const scores = riskMappingToImageScores(mapped);
    expect(scores.adultScore).toBeGreaterThan(0.5);
    expect(toApiCategory(mapped.category)).toBe('adult');
  });

  it('maps gun and rifle labels to violent', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Gun', confidence: 0.91 },
      { label: 'Weapon', confidence: 0.85 },
    ]);
    expect(mapped.category).toBe('violent');
    expect(mapped.riskScore).toBeGreaterThan(70);
  });

  it('maps syringe and pill to dangerous (drugs)', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Syringe', confidence: 0.88 },
      { label: 'Pill', confidence: 0.8 },
    ]);
    expect(mapped.category).toBe('dangerous');
    expect(mapped.riskScore).toBeGreaterThan(60);
  });

  it('uses anime/cartoon proxy for hentai-like content', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Cartoon', confidence: 0.82 },
      { label: 'Illustration', confidence: 0.78 },
    ]);
    expect(mapped.category).toBe('adult');
    expect(mapped.riskScore).toBeGreaterThan(40);
  });

  it('does not mark landscape-only as high adult risk', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Sky', confidence: 0.9 },
      { label: 'Mountain', confidence: 0.85 },
      { label: 'Landscape', confidence: 0.8 },
    ]);
    expect(mapped.riskScore).toBeLessThan(25);
    expect(mapped.category).toBe('neutral');
  });

  it('never leaves neutral when risk score >= 50', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Skin', confidence: 0.7 },
      { label: 'Hand', confidence: 0.65 },
    ]);
    expect(mapped.riskScore).toBeGreaterThanOrEqual(50);
    expect(mapped.category).not.toBe('neutral');
  });
});

describe('riskCombination consistency', () => {
  it('fixes YES risk 70 with neutral category', () => {
    const image = {
      violenceScore: 0.1,
      adultScore: 0.65,
      goreScore: 0,
      dangerousChallengeScore: 0,
      educationalScore: 0,
    };
    const cat = resolveFinalCategoryWithScore(72, true, image, 'neutral', 'neutral');
    expect(cat).not.toBe('neutral');
    expect(enforceCategoryConsistency(72, true, 'neutral', image, 'neutral')).toBe('adult');
  });
});
