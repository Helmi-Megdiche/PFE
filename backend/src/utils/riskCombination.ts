/** Risk combination weights (mirrors MobileApp/src/utils/riskCombination.ts). */

const OCR_WEIGHT = 0.3;
const IMAGE_WEIGHT = 0.7;

export function computeOcrRiskScore(
  riskFlag: boolean,
  category: string,
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

export function combineRiskScores(
  ocrRiskScore: number,
  imageRiskScore: number,
): number {
  return Math.round(
    Math.min(100, Math.max(0, ocrRiskScore * OCR_WEIGHT + imageRiskScore * IMAGE_WEIGHT)),
  );
}

const VISION_PRIORITY = new Set(['adult', 'violent']);

/**
 * Final category: vision adult/violent wins; otherwise OCR category.
 */
export function resolveDebugFinalCategory(
  visionCategory: string,
  ocrCategory: string,
): string {
  if (VISION_PRIORITY.has(visionCategory)) {
    return visionCategory;
  }
  return ocrCategory || 'neutral';
}
