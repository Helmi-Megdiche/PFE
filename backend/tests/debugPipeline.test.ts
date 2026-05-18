import { mapNsfwPredictions } from '../src/debug/nsfwVision';
import { analyzeText, keywordFilter } from '../src/utils/keywordFilter';
import {
  combineRiskScores,
  resolveDebugFinalCategory,
} from '../src/utils/riskCombination';

describe('debug pipeline (pure functions)', () => {
  it('maps nsfwjs adult probabilities to high vision risk', () => {
    const vision = mapNsfwPredictions([
      { className: 'Porn', probability: 0.85 },
      { className: 'Sexy', probability: 0.1 },
      { className: 'Neutral', probability: 0.05 },
    ]);
    expect(vision.category).toBe('adult');
    expect(vision.riskScore).toBe(95);
    expect(vision.labels.porn).toBe(0.85);
  });

  it('maps neutral nsfwjs output to low vision risk', () => {
    const vision = mapNsfwPredictions([
      { className: 'Neutral', probability: 0.92 },
      { className: 'Drawing', probability: 0.05 },
    ]);
    expect(vision.category).toBe('neutral');
    expect(vision.riskScore).toBeLessThan(10);
  });

  it('detects violent OCR keywords', () => {
    const analyzed = analyzeText('someone said kill and murder on this page');
    expect(analyzed.riskFlag).toBe(true);
    expect(analyzed.category).toBe('violent');
    expect(analyzed.riskScore).toBeGreaterThan(50);
  });

  it('combines OCR and vision with 30/70 weights', () => {
    const combined = combineRiskScores(10, 90);
    expect(combined).toBe(Math.round(10 * 0.3 + 90 * 0.7));
  });

  it('prefers adult vision category over neutral OCR', () => {
    expect(resolveDebugFinalCategory('adult', 'neutral')).toBe('adult');
  });

  it('falls back to OCR category when vision is neutral', () => {
    const ocr = keywordFilter('this is a hate speech message');
    const analyzed = analyzeText('this is a hate speech message');
    expect(ocr.category).toBe('toxic');
    expect(resolveDebugFinalCategory('neutral', analyzed.category)).toBe('toxic');
  });
});
