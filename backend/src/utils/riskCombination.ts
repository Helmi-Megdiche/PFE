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
  if (category === 'violent') {
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

const VISION_PRIORITY = new Set(['adult', 'violent', 'gore', 'dangerous_challenge']);

export function resolveDebugFinalCategory(
  visionCategory: string,
  ocrCategory: string,
): string {
  if (VISION_PRIORITY.has(visionCategory)) {
    return visionCategory;
  }
  if (ocrCategory === 'adult' || ocrCategory === 'violent' || ocrCategory === 'dangerous_challenge') {
    return ocrCategory;
  }
  return ocrCategory || 'neutral';
}

export function enforceCategoryConsistency(
  combinedRiskScore: number,
  riskFlag: boolean,
  category: string,
  visionCategory: string,
  ocrCategory: string,
): string {
  if (combinedRiskScore < 50 && !riskFlag) {
    return category;
  }
  if (category !== 'neutral' && category !== 'educational') {
    return category;
  }
  if (VISION_PRIORITY.has(visionCategory)) return visionCategory;
  if (ocrCategory === 'adult') return 'adult';
  if (ocrCategory === 'violent') return 'violent';
  if (ocrCategory === 'dangerous_challenge' || ocrCategory === 'dangerous') {
    return 'dangerous_challenge';
  }
  return 'adult';
}

export interface VisionOcrRiskSlice {
  category: string;
  riskScore: number;
}

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

  if (adjustedOcr.category === 'violent' && adjustedOcr.riskScore > 50) {
    finalCategory = 'violent';
    combinedRiskScore = Math.max(combinedRiskScore, 80);
  }

  finalCategory = enforceCategoryConsistency(
    combinedRiskScore,
    adjustedOcr.riskScore > 50,
    finalCategory,
    adjustedVision.category,
    adjustedOcr.category,
  );

  return {
    vision: adjustedVision,
    ocr: adjustedOcr,
    combinedRiskScore,
    finalCategory,
  };
}
