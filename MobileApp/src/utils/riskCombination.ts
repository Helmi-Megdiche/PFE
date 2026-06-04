import type {
  ImageClassificationScores,
  VisionRiskCategory,
} from '../types/imageClassification';
import type { RiskCategory } from '../types/screenMonitor';

const OCR_WEIGHT = 0.3;
const IMAGE_WEIGHT = 0.7;

const CATEGORY_PRIORITY: VisionRiskCategory[] = [
  'educational',
  'neutral',
  'dangerous_challenge',
  'gore',
  'toxic',
  'violent',
  'adult',
];

export function computeOcrRiskScore(
  riskFlag: boolean,
  category: RiskCategory,
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

export function applyExplicitOcrBoost(
  ocrRiskScore: number,
  imageRiskScore: number,
  ocrCategory: RiskCategory,
  imageAdultScore: number,
): { combinedRiskScore: number; imageRiskScore: number } {
  let adjustedImage = imageRiskScore;

  if (ocrCategory === 'adult' && ocrRiskScore > 50 && imageAdultScore < 0.3) {
    adjustedImage = Math.max(adjustedImage, 70);
  }

  let combinedRiskScore = combineRiskScores(ocrRiskScore, adjustedImage);
  if (ocrCategory === 'adult') {
    combinedRiskScore = Math.max(combinedRiskScore, 70);
  }
  if (ocrCategory === 'violent' && ocrRiskScore > 50) {
    combinedRiskScore = Math.max(combinedRiskScore, 80);
  }

  return { combinedRiskScore, imageRiskScore: adjustedImage };
}

function categoryFromImageScores(image: ImageClassificationScores): VisionRiskCategory | null {
  const axes: Array<{ cat: VisionRiskCategory; score: number }> = [
    { cat: 'adult', score: image.adultScore },
    { cat: 'violent', score: image.violenceScore },
    { cat: 'gore', score: image.goreScore },
    { cat: 'dangerous_challenge', score: image.dangerousChallengeScore },
    { cat: 'educational', score: image.educationalScore },
  ];
  axes.sort((a, b) => b.score - a.score);
  if (axes[0].score < 0.35) {
    return null;
  }
  return axes[0].cat;
}

export function resolveCombinedCategory(
  image: ImageClassificationScores,
  ocrCategory: RiskCategory,
  mappedCategory?: string | null,
): VisionRiskCategory {
  const fromScores = categoryFromImageScores(image);
  if (fromScores && fromScores !== 'neutral' && fromScores !== 'educational') {
    return fromScores;
  }

  if (image.violenceScore > 0.5) return 'violent';
  if (image.adultScore > 0.5) return 'adult';
  if (image.goreScore > 0.5) return 'gore';
  if (image.dangerousChallengeScore > 0.5) return 'dangerous_challenge';

  if (mappedCategory && mappedCategory !== 'neutral') {
    const m = mappedCategory as VisionRiskCategory;
    if (CATEGORY_PRIORITY.includes(m)) {
      return m;
    }
  }

  if (ocrCategory === 'adult') return 'adult';
  if (ocrCategory === 'toxic') return 'toxic';
  if (ocrCategory === 'violent' || ocrCategory === 'dangerous') {
    return ocrCategory === 'dangerous' ? 'dangerous_challenge' : 'violent';
  }
  if (ocrCategory === 'educational') return 'educational';
  return 'neutral';
}

/**
 * Never leave category as neutral when combined score >= 50 or risk flag is set.
 */
export function enforceCategoryConsistency(
  combinedRiskScore: number,
  riskFlag: boolean,
  category: VisionRiskCategory,
  image: ImageClassificationScores,
  ocrCategory: RiskCategory,
): VisionRiskCategory {
  if (combinedRiskScore < 50 && !riskFlag) {
    return category;
  }
  if (category !== 'neutral' && category !== 'educational') {
    return category;
  }

  const fromImage = categoryFromImageScores(image);
  if (fromImage && fromImage !== 'neutral' && fromImage !== 'educational') {
    return fromImage;
  }

  if (ocrCategory === 'adult') return 'adult';
  if (ocrCategory === 'violent') return 'violent';
  if (ocrCategory === 'dangerous') return 'dangerous_challenge';
  if (ocrCategory === 'toxic') return 'toxic';
  if (image.adultScore >= image.violenceScore) return 'adult';
  if (image.violenceScore > 0.3) return 'violent';
  if (image.goreScore > 0.3) return 'gore';
  if (image.dangerousChallengeScore > 0.3) return 'dangerous_challenge';
  return 'adult';
}

export interface PostProcessInput {
  combinedRiskScore: number;
  finalCategory: VisionRiskCategory;
  ocrCategory: RiskCategory;
  keywordRiskFlag: boolean;
  matchedKeywords: string[];
}

/** Text + score overrides for explicit/violent/drug keywords in OCR. */
export function applyPostProcessingOverride(input: PostProcessInput): {
  combinedRiskScore: number;
  finalCategory: VisionRiskCategory;
} {
  let { combinedRiskScore, finalCategory } = input;
  const kw = input.matchedKeywords.map((k) => k.toLowerCase());

  const violentKw = [
    'gun', 'rifle', 'weapon', 'kill', 'murder', 'bomb', 'knife',
    'gore', 'gory', 'blood', 'stab', 'assault', 'fight', 'massacre', 'behead',
    'dismember', 'mutilation', 'corpse', 'brutal',
  ];
  const drugKw = ['drug', 'syringe', 'cocaine', 'heroin', 'pill', 'meth', 'weed'];
  const adultKw = ['porn', 'hentai', 'xxx', 'nsfw', 'nude', 'sex'];

  if (kw.some((k) => adultKw.some((a) => k.includes(a)))) {
    combinedRiskScore = Math.max(combinedRiskScore, 85);
    finalCategory = 'adult';
  } else if (kw.some((k) => violentKw.some((v) => k.includes(v)))) {
    combinedRiskScore = Math.max(combinedRiskScore, 80);
    finalCategory = 'violent';
  } else if (kw.some((k) => drugKw.some((d) => k.includes(d)))) {
    combinedRiskScore = Math.max(combinedRiskScore, 75);
    finalCategory = 'dangerous_challenge';
  }

  return { combinedRiskScore, finalCategory };
}

export function resolveFinalCategoryWithScore(
  combinedRiskScore: number,
  riskFlag: boolean,
  image: ImageClassificationScores,
  ocrCategory: RiskCategory,
  mappedCategory?: string | null,
): VisionRiskCategory {
  const base = resolveCombinedCategory(image, ocrCategory, mappedCategory);
  return enforceCategoryConsistency(combinedRiskScore, riskFlag, base, image, ocrCategory);
}
