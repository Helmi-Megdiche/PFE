import {
  mapMlKitLabelsToRisk,
  riskMappingToImageScores,
  toApiCategory,
} from '../src/utils/riskMapping';

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

  it('does not mark screenshot-only as high adult risk', () => {
    const mapped = mapMlKitLabelsToRisk([
      { label: 'Screenshot', confidence: 0.87 },
      { label: 'Mobile phone', confidence: 0.8 },
    ]);
    expect(mapped.riskScore).toBeLessThan(25);
  });
});
