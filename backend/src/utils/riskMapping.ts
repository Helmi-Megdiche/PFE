/**
 * Shared ML Kit label → risk mapping (keep in sync with MobileApp/src/utils/riskMapping.ts).
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

const WEAPONS_KEYWORDS = [
  'gun', 'rifle', 'pistol', 'revolver', 'knife', 'sword', 'blade', 'weapon',
  'explosion', 'bomb', 'grenade', 'tank', 'military', 'combat', 'ammunition',
  'firearm', 'shotgun', 'missile', 'war', 'soldier',
];

const DRUGS_KEYWORDS = [
  'syringe', 'needle', 'pill', 'capsule', 'cigarette', 'cigar', 'smoking',
  'alcohol', 'beer', 'wine', 'bottle', 'drug', 'cannabis', 'marijuana',
  'cocaine', 'heroin', 'meth', 'vape', 'liquor', 'whiskey',
];

const GORE_KEYWORDS = [
  'blood', 'injury', 'wound', 'corpse', 'dead', 'skeleton', 'gore', 'guts',
  'horror', 'skull', 'mutilation', 'autopsy',
];

const ADULT_KEYWORDS = [
  'skin', 'underwear', 'bikini', 'nude', 'lingerie', 'cleavage', 'erotic',
  'breast', 'buttocks', 'genital', 'penis', 'vagina', 'flesh', 'muscle', 'torso',
  'porn', 'xxx', 'nsfw', 'sex', 'adult', 'naked', 'hentai', 'erotica', 'fetish',
];

const CATEGORY_RULES: CategoryRule[] = [
  { id: 'adult', weight: 1.0, keywords: ADULT_KEYWORDS },
  { id: 'violent', weight: 1.0, keywords: WEAPONS_KEYWORDS },
  { id: 'gore', weight: 0.9, keywords: GORE_KEYWORDS },
  {
    id: 'dangerous',
    weight: 0.9,
    keywords: [
      ...DRUGS_KEYWORDS,
      'fire', 'jump', 'cliff', 'razor', 'stunt', 'suicide', 'cutting', 'self-harm',
      'challenge', 'overdose',
    ],
  },
  {
    id: 'educational',
    weight: -0.5,
    keywords: ['book', 'classroom', 'science', 'blackboard', 'library', 'school', 'whiteboard'],
  },
];

export const CATEGORY_PRIORITY: RiskMapCategory[] = [
  'educational',
  'neutral',
  'dangerous',
  'gore',
  'violent',
  'adult',
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

export function toApiCategory(category: RiskMapCategory | string): string {
  if (category === 'dangerous') {
    return 'dangerous_challenge';
  }
  return category;
}

export function pickHighestRiskCategory(
  categoryWeights: Record<string, number>,
): RiskMapCategory {
  let best: RiskMapCategory = 'neutral';
  let bestWeight = 0;
  for (const cat of CATEGORY_PRIORITY) {
    const w = categoryWeights[cat] ?? 0;
    if (w > bestWeight) {
      bestWeight = w;
      best = cat;
    }
  }
  return bestWeight >= 0.15 ? best : 'neutral';
}

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

  const animeLike = labels.find((l) =>
    /anime|cartoon|comic|manga|illustration|drawing/i.test(l.label),
  );
  if (animeLike && animeLike.confidence > 0.55) {
    categoryWeights.adult = Math.max(categoryWeights.adult, animeLike.confidence * 0.85);
    contributingLabels.push(`heuristic:anime-proxy:${animeLike.confidence.toFixed(2)}`);
  }

  let riskScore = 0;
  for (const rule of CATEGORY_RULES) {
    riskScore += (categoryWeights[rule.id] ?? 0) * 100;
  }
  riskScore = clampScore(riskScore);

  let category = pickHighestRiskCategory(categoryWeights);
  const eduStrength = Math.abs(categoryWeights.educational ?? 0);
  const maxPositive = Math.max(
    categoryWeights.adult ?? 0,
    categoryWeights.violent ?? 0,
    categoryWeights.gore ?? 0,
    categoryWeights.dangerous ?? 0,
  );
  if (maxPositive < 0.15 && eduStrength > 0.2) {
    category = 'educational';
  } else if (maxPositive < 0.15) {
    category = 'neutral';
  }

  if (riskScore >= 50 && category === 'neutral') {
    category = pickHighestRiskCategory(categoryWeights);
    if (category === 'neutral' || category === 'educational') {
      category = 'adult';
    }
  }

  const topLabels = labels
    .slice()
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 10)
    .map((l) => l.label);

  return { category, riskScore, topLabels, categoryWeights };
}
