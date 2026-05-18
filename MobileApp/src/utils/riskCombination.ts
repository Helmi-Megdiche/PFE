import type {
  ImageClassificationScores,
  VisionRiskCategory,
} from '../types/imageClassification';
import type { RiskCategory } from '../types/screenMonitor';

const OCR_WEIGHT = 0.3;
const IMAGE_WEIGHT = 0.7;

export function computeOcrRiskScore(
  riskFlag: boolean,
  category: RiskCategory,
  matchedCount: number,
): number {
  if (riskFlag) {
    return Math.min(100, 50 + matchedCount * 12);
  }
  if (category === 'educational') {
    return 15;
  }
  return 5;
}

export function computeImageRiskScore(scores: ImageClassificationScores): number {
  const raw =
    (scores.violenceScore * 0.4 +
      scores.adultScore * 0.3 +
      scores.goreScore * 0.2 +
      scores.dangerousChallengeScore * 0.1) *
    100;
  return Math.round(Math.min(100, Math.max(0, raw)));
}

export function combineRiskScores(
  ocrRiskScore: number,
  imageRiskScore: number,
): number {
  return Math.round(
    Math.min(100, Math.max(0, ocrRiskScore * OCR_WEIGHT + imageRiskScore * IMAGE_WEIGHT)),
  );
}

export function resolveCombinedCategory(
  image: ImageClassificationScores,
  ocrCategory: RiskCategory,
  mappedCategory?: string | null,
): VisionRiskCategory {
  if (mappedCategory) {
    const m = mappedCategory as VisionRiskCategory;
    if (
      [
        'violent',
        'adult',
        'gore',
        'dangerous_challenge',
        'educational',
        'neutral',
        'toxic',
      ].includes(m)
    ) {
      return m;
    }
  }

  if (image.violenceScore > 0.6) {
    return 'violent';
  }
  if (image.adultScore > 0.6) {
    return 'adult';
  }
  if (image.goreScore > 0.6) {
    return 'gore';
  }
  if (image.dangerousChallengeScore > 0.6) {
    return 'dangerous_challenge';
  }
  if (image.educationalScore > 0.7) {
    return 'educational';
  }
  if (ocrCategory === 'toxic') {
    return 'toxic';
  }
  if (ocrCategory === 'violent' || ocrCategory === 'dangerous') {
    return ocrCategory === 'dangerous' ? 'dangerous_challenge' : 'violent';
  }
  if (ocrCategory === 'educational') {
    return 'educational';
  }
  return 'neutral';
}
