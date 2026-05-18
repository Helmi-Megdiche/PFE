/**
 * Shared ML Kit label → risk mapping (mobile + backend copy must stay in sync).
 */

export interface MlKitLabel {
  label: string;
  confidence: number;
}

export type RiskMapCategory =
  | 'adult'
  | 'violent'
  | 'gore'
  | 'dangerous'
  | 'educational'
  | 'neutral';

export interface RiskMappingResult {
  category: RiskMapCategory;
  riskScore: number;
  topLabels: string[];
  categoryWeights: Record<string, number>;
}

interface CategoryRule {
  id: RiskMapCategory;
  weight: number;
  keywords: string[];
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    id: 'adult',
    weight: 1.0,
    keywords: [
      'skin',
      'underwear',
      'bikini',
      'nude',
      'lingerie',
      'cleavage',
      'erotic',
      'breast',
      'buttocks',
      'genital',
      'penis',
      'vagina',
      'flesh',
      'muscle',
      'torso',
    ],
  },
  {
    id: 'violent',
    weight: 1.0,
    keywords: ['weapon', 'gun', 'knife', 'sword', 'fight', 'explosion', 'riot'],
  },
  {
    id: 'gore',
    weight: 0.9,
    keywords: ['blood', 'injury', 'corpse', 'skeleton', 'guts', 'wound', 'horror'],
  },
  {
    id: 'dangerous',
    weight: 0.8,
    keywords: ['fire', 'jump', 'cliff', 'syringe', 'pills', 'razor', 'stunt', 'challenge'],
  },
  {
    id: 'educational',
    weight: -0.5,
    keywords: ['book', 'classroom', 'science', 'blackboard', 'library', 'school', 'whiteboard'],
  },
];

function matchesKeyword(labelText: string, keyword: string): boolean {
  return labelText.includes(keyword.toLowerCase());
}

function findCategoryForLabel(labelText: string): CategoryRule | null {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => matchesKeyword(labelText, kw))) {
      return rule;
    }
  }
  return null;
}

function clampScore(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)));
}

/** Map API category to stored screen_events category. */
export function toApiCategory(category: RiskMapCategory | string): string {
  if (category === 'dangerous') {
    return 'dangerous_challenge';
  }
  return category;
}

/**
 * Maps ML Kit / MobileNet labels to a risk category and 0–100 score.
 */
export function mapMlKitLabelsToRisk(labels: MlKitLabel[]): RiskMappingResult {
  const categoryWeights: Record<string, number> = {
    adult: 0,
    violent: 0,
    gore: 0,
    dangerous: 0,
    educational: 0,
  };
  const contributingLabels: string[] = [];

  for (const entry of labels) {
    const text = (entry.label || '').toLowerCase().trim();
    if (!text) continue;

    const rule = findCategoryForLabel(text);
    if (rule) {
      const contribution = rule.weight * entry.confidence;
      categoryWeights[rule.id] = (categoryWeights[rule.id] ?? 0) + contribution;
      if (entry.confidence >= 0.4) {
        contributingLabels.push(`${text}:${entry.confidence.toFixed(2)}`);
      }
    }
  }

  const skin = labels.find((l) => l.label.toLowerCase().includes('skin'));
  const hand = labels.find((l) => l.label.toLowerCase().includes('hand'));
  if (skin && hand && skin.confidence > 0.6 && hand.confidence > 0.6) {
    categoryWeights.adult = Math.max(categoryWeights.adult, 0.8);
    contributingLabels.push('heuristic:skin+hand');
  }

  let riskScore = 0;
  for (const rule of CATEGORY_RULES) {
    riskScore += (categoryWeights[rule.id] ?? 0) * 100;
  }
  riskScore = clampScore(riskScore);

  const positiveCategories: RiskMapCategory[] = ['adult', 'violent', 'gore', 'dangerous'];
  let category: RiskMapCategory = 'neutral';
  let maxWeight = 0;
  for (const cat of positiveCategories) {
    const w = categoryWeights[cat] ?? 0;
    if (w > maxWeight) {
      maxWeight = w;
      category = cat;
    }
  }

  const eduStrength = Math.abs(categoryWeights.educational ?? 0);
  if (maxWeight < 0.15 && eduStrength > 0.2) {
    category = 'educational';
  } else if (maxWeight < 0.15) {
    category = 'neutral';
  }

  const topLabels = labels
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((l) => l.label);

  return {
    category,
    riskScore,
    topLabels,
    categoryWeights,
  };
}

/** Convert mapping result to legacy per-axis scores for combineRiskScores. */
export function riskMappingToImageScores(mapped: RiskMappingResult): {
  violenceScore: number;
  adultScore: number;
  goreScore: number;
  dangerousChallengeScore: number;
  educationalScore: number;
} {
  const w = mapped.categoryWeights;
  return {
    violenceScore: Math.min(1, w.violent ?? 0),
    adultScore: Math.min(1, w.adult ?? 0),
    goreScore: Math.min(1, w.gore ?? 0),
    dangerousChallengeScore: Math.min(1, w.dangerous ?? 0),
    educationalScore: Math.min(1, Math.max(0, w.educational ?? 0)),
  };
}
