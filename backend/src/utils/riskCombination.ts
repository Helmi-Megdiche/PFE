/** Risk combination weights (mirrors MobileApp/src/utils/riskCombination.ts). */

const OCR_WEIGHT = 0.3;
const IMAGE_WEIGHT = 0.7;

export function computeOcrRiskScore(
  riskFlag: boolean,
  category: string,
  matchedCount: number,
): number {
  if (category === 'adult') {
    return Math.min(100, Math.max(70, 50 + matchedCount * 12));
  }
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
  if (ocrCategory === 'adult') {
    return 'adult';
  }
  return ocrCategory || 'neutral';
}

export interface VisionOcrRiskSlice {
  category: string;
  riskScore: number;
}

/**
 * When OCR detects explicit adult text but vision is neutral/low, boost vision + combined score.
 */
export function applyExplicitContentOverride(
  vision: VisionOcrRiskSlice,
  ocr: VisionOcrRiskSlice,
): {
  vision: VisionOcrRiskSlice;
  ocr: VisionOcrRiskSlice;
  combinedRiskScore: number;
  finalCategory: string;
} {
  let adjustedVision = { ...vision };
  const adjustedOcr = { ...ocr };

  if (adjustedOcr.category === 'adult' && adjustedOcr.riskScore > 50) {
    if (adjustedVision.category === 'neutral' && adjustedVision.riskScore < 30) {
      adjustedVision = {
        category: 'adult',
        riskScore: Math.max(adjustedVision.riskScore, 70),
      };
    }
  }

  let combinedRiskScore = combineRiskScores(adjustedOcr.riskScore, adjustedVision.riskScore);
  let finalCategory = resolveDebugFinalCategory(adjustedVision.category, adjustedOcr.category);

  if (adjustedOcr.category === 'adult') {
    finalCategory = 'adult';
    combinedRiskScore = Math.max(combinedRiskScore, 70);
  }

  return {
    vision: adjustedVision,
    ocr: adjustedOcr,
    combinedRiskScore,
    finalCategory,
  };
}
