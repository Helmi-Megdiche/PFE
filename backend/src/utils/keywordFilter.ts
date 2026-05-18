import { RISK_KEYWORDS } from '../constants/riskKeywords';
import { computeOcrRiskScore } from './riskCombination';

export type RiskCategory =
  | 'violent'
  | 'toxic'
  | 'dangerous'
  | 'educational'
  | 'neutral';

export interface KeywordFilterResult {
  riskFlag: boolean;
  category: RiskCategory;
  matchedKeywords: string[];
}

const RISK_CATEGORIES: RiskCategory[] = ['violent', 'toxic', 'dangerous'];

/**
 * Keyword scan on OCR text (mirrors MobileApp/src/utils/keywordFilter.ts).
 */
export function keywordFilter(text: string): KeywordFilterResult {
  const normalized = text.toLowerCase();
  const matchedKeywords: string[] = [];
  let category: RiskCategory = 'neutral';

  for (const cat of RISK_CATEGORIES) {
    const hits = RISK_KEYWORDS[cat].filter((kw) => normalized.includes(kw));
    if (hits.length > 0) {
      matchedKeywords.push(...hits);
      category = cat;
      return { riskFlag: true, category, matchedKeywords };
    }
  }

  const eduHits = RISK_KEYWORDS.educational.filter((kw) => normalized.includes(kw));
  if (eduHits.length > 0) {
    matchedKeywords.push(...eduHits);
    category = 'educational';
  }

  return { riskFlag: false, category, matchedKeywords };
}

export function ocrCategoryToApi(category: RiskCategory): string {
  if (category === 'dangerous') {
    return 'dangerous_challenge';
  }
  return category;
}

/**
 * OCR risk analysis for debug endpoint (keyword filter + score).
 */
export function analyzeText(text: string): {
  riskScore: number;
  riskFlag: boolean;
  category: string;
  matchedKeywords: string[];
  rawCategory: RiskCategory;
} {
  const result = keywordFilter(text);
  const riskScore = computeOcrRiskScore(
    result.riskFlag,
    result.category,
    result.matchedKeywords.length,
  );
  return {
    riskScore,
    riskFlag: result.riskFlag,
    category: ocrCategoryToApi(result.category),
    matchedKeywords: result.matchedKeywords,
    rawCategory: result.category,
  };
}
