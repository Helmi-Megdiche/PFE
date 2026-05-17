import {
  combineRiskScores,
  computeImageRiskScore,
  computeOcrRiskScore,
  resolveCombinedCategory,
} from '../src/utils/riskCombination';

describe('riskCombination', () => {
  it('weights image risk higher than OCR', () => {
    expect(combineRiskScores(100, 0)).toBe(30);
    expect(combineRiskScores(0, 100)).toBe(70);
  });

  it('computes image risk from unsafe scores', () => {
    const score = computeImageRiskScore({
      violenceScore: 1,
      adultScore: 0,
      goreScore: 0,
      dangerousChallengeScore: 0,
      educationalScore: 0,
    });
    expect(score).toBe(40);
  });

  it('resolves violent category when violence > 0.6', () => {
    const cat = resolveCombinedCategory(
      {
        violenceScore: 0.9,
        adultScore: 0,
        goreScore: 0,
        dangerousChallengeScore: 0,
        educationalScore: 0,
      },
      'neutral',
    );
    expect(cat).toBe('violent');
  });

  it('uses OCR toxic when image is neutral', () => {
    expect(
      resolveCombinedCategory(
        {
          violenceScore: 0.1,
          adultScore: 0.1,
          goreScore: 0.1,
          dangerousChallengeScore: 0.1,
          educationalScore: 0.2,
        },
        'toxic',
      ),
    ).toBe('toxic');
  });

  it('OCR risk increases with keyword hits', () => {
    expect(computeOcrRiskScore(true, 'violent', 2)).toBeGreaterThan(
      computeOcrRiskScore(false, 'neutral', 0),
    );
  });
});
