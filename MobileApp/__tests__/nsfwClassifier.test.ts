import {
  mapNsfwProbabilityToCategory,
  mapNsfwProbabilityToRiskScore,
  probabilitiesFromNsfwScore,
} from '../src/services/nsfwClassifier';

describe('nsfwClassifier', () => {
  it('maps high nsfw probability to adult', () => {
    expect(mapNsfwProbabilityToCategory(0.85)).toBe('adult');
    expect(mapNsfwProbabilityToRiskScore(0.85)).toBe(85);
  });

  it('maps mid nsfw probability to suggestive', () => {
    expect(mapNsfwProbabilityToCategory(0.45)).toBe('suggestive');
    expect(mapNsfwProbabilityToRiskScore(0.45)).toBe(45);
  });

  it('maps low nsfw probability to neutral', () => {
    expect(mapNsfwProbabilityToCategory(0.1)).toBe('neutral');
    expect(mapNsfwProbabilityToRiskScore(0.1)).toBe(10);
  });

  it('builds probability vector from nsfw score', () => {
    const p = probabilitiesFromNsfwScore(0.8);
    expect(p.porn).toBe(0.8);
    expect(p.neutral).toBeCloseTo(0.2);
  });
});
