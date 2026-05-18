import { RISK_KEYWORDS } from '../constants/riskKeywords';
import { computeOcrRiskScore } from './riskCombination';

export type RiskCategory =
  | 'violent'
  | 'toxic'
  | 'dangerous'
  | 'educational'
  | 'adult'
  | 'neutral';

export interface KeywordFilterResult {
  riskFlag: boolean;
  category: RiskCategory;
  matchedKeywords: string[];
}

/** Explicit terms — checked first; overrides other categories (mirrors mobile). */
export const HIGH_RISK_KEYWORDS: readonly string[] = [
  'porn',
  'xxx',
  'nsfw',
  'sex',
  'adult',
  'nude',
  'naked',
  'fuck',
  'bitch',
  'shit',
  'ass',
  'dick',
  'pussy',
  'orgy',
  'cum',
  'blowjob',
  'hentai',
];

const HIGH_RISK_BOUNDARY_REGEX = /\b(porn|sex|adult|nude|xxx|nsfw|fuck|hentai)\b/i;

const RISK_CATEGORIES: RiskCategory[] = ['violent', 'toxic', 'dangerous'];

/**
 * Find explicit high-risk terms (substring + word-boundary regex for broken OCR).
 */
export function findHighRiskKeywords(text: string): string[] {
  const normalized = text.toLowerCase();
  const matched = new Set<string>();

  for (const kw of HIGH_RISK_KEYWORDS) {
    if (normalized.includes(kw)) {
      matched.add(kw);
    }
  }

  const regexHits = text.match(HIGH_RISK_BOUNDARY_REGEX);
  if (regexHits) {
    for (const hit of regexHits) {
      matched.add(hit.toLowerCase());
    }
  }

  return [...matched];
}

/**
 * Keyword scan on OCR text (mirrors MobileApp/src/utils/keywordFilter.ts).
 */
export function keywordFilter(text: string): KeywordFilterResult {
  const highRiskHits = findHighRiskKeywords(text);
  if (highRiskHits.length > 0) {
    return { riskFlag: true, category: 'adult', matchedKeywords: highRiskHits };
  }

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
 * OCR risk analysis (keyword filter + explicit-content boost).
 */
export function analyzeText(text: string): {
  riskScore: number;
  riskFlag: boolean;
  category: string;
  matchedKeywords: string[];
  rawCategory: RiskCategory;
} {
  const result = keywordFilter(text);
  let riskScore = computeOcrRiskScore(
    result.riskFlag,
    result.category,
    result.matchedKeywords.length,
  );
  let category = ocrCategoryToApi(result.category);
  let riskFlag = result.riskFlag;

  if (result.category === 'adult' && result.matchedKeywords.length > 0) {
    riskScore = Math.min(100, Math.max(70, riskScore + 70));
    category = 'adult';
    riskFlag = true;
  }

  return {
    riskScore,
    riskFlag,
    category,
    matchedKeywords: result.matchedKeywords,
    rawCategory: result.category,
  };
}
