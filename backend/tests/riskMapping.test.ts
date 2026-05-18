import { mapMlKitLabelsToRisk, toApiCategory } from '../src/utils/riskMapping';

describe('mapMlKitLabelsToRisk', () => {
  it('maps adult labels including skin and hand heuristic', () => {
    const result = mapMlKitLabelsToRisk([
      { label: 'Skin', confidence: 0.93 },
      { label: 'Hand', confidence: 0.91 },
    ]);
    expect(result.category).toBe('adult');
    expect(result.riskScore).toBeGreaterThanOrEqual(50);
    expect(toApiCategory(result.category)).toBe('adult');
  });

  it('maps violent weapon labels', () => {
    const result = mapMlKitLabelsToRisk([{ label: 'Gun', confidence: 0.88 }]);
    expect(result.category).toBe('violent');
    expect(result.riskScore).toBeGreaterThan(70);
  });

  it('reduces score with educational labels', () => {
    const edu = mapMlKitLabelsToRisk([{ label: 'Book', confidence: 0.9 }]);
    const mixed = mapMlKitLabelsToRisk([
      { label: 'Book', confidence: 0.9 },
      { label: 'Screenshot', confidence: 0.5 },
    ]);
    expect(edu.category).toBe('educational');
    expect(mixed.riskScore).toBeLessThanOrEqual(edu.riskScore + 30);
  });

  it('returns neutral for unrelated labels', () => {
    const result = mapMlKitLabelsToRisk([
      { label: 'Screenshot', confidence: 0.8 },
      { label: 'Mobile phone', confidence: 0.7 },
    ]);
    expect(result.category).toBe('neutral');
    expect(result.riskScore).toBeLessThan(30);
  });

  it('maps gore blood labels', () => {
    const result = mapMlKitLabelsToRisk([{ label: 'Blood', confidence: 0.85 }]);
    expect(result.category).toBe('gore');
    expect(result.riskScore).toBeGreaterThan(40);
  });

  it('maps dangerous to API category dangerous_challenge', () => {
    const result = mapMlKitLabelsToRisk([{ label: 'Fire', confidence: 0.9 }]);
    expect(result.category).toBe('dangerous');
    expect(toApiCategory(result.category)).toBe('dangerous_challenge');
  });
});
