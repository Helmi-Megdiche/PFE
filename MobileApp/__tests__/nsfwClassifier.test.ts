import {
  applyNsfwThresholds,
  inferNsfwFromMlKitLabels,
} from '../src/services/nsfwClassifier';

describe('nsfwClassifier', () => {
  it('forces adult when hentai > 0.5', () => {
    const t = applyNsfwThresholds({
      porn: 0.1,
      sexy: 0.1,
      hentai: 0.72,
      neutral: 0.08,
      drawing: 0.8,
    });
    expect(t.forced).toBe(true);
    expect(t.category).toBe('adult');
    expect(t.riskScore).toBe(100);
  });

  it('infers hentai from cartoon ML Kit labels', () => {
    const probs = inferNsfwFromMlKitLabels([
      { text: 'Cartoon', confidence: 0.85 },
      { text: 'Illustration', confidence: 0.8 },
    ]);
    expect(probs.hentai).toBeGreaterThan(0.5);
    const t = applyNsfwThresholds(probs);
    expect(t.category).toBe('adult');
  });
});
