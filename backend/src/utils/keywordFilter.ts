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

/** Arabic Unicode block (basic + extended A/B + presentation forms). */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabicScript(text: string): boolean {
  return !!text && ARABIC_SCRIPT_RE.test(text);
}

/** Share of letter characters that are Arabic (0–1). */
export function arabicLetterRatio(text: string): number {
  const arabic = text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/g)?.length ?? 0;
  const latin = text.match(/[a-zA-Z]/g)?.length ?? 0;
  const total = arabic + latin;
  if (total === 0) return 0;
  return arabic / total;
}

/**
 * True when OCR output is mostly Arabic — used to ignore short English tokens
 * (e.g. "ass") that Tesseract often hallucinates from Arabic letter shapes.
 */
export function isArabicPrimaryOcrText(text: string): boolean {
  return containsArabicScript(text) && arabicLetterRatio(text) >= 0.25;
}

function shouldSkipLatinKeywordForArabicOcr(text: string, kw: string): boolean {
  return isArabicPrimaryOcrText(text) && !containsArabicScript(kw) && kw.length <= 3;
}

/** English explicit terms — short ones use \b word boundary. */
export const HIGH_RISK_KEYWORDS: readonly string[] = [
  'porn', 'xxx', 'nsfw', 'sex', 'adult', 'nude', 'naked', 'fuck', 'bitch',
  'shit', 'ass', 'dick', 'pussy', 'orgy', 'cum', 'blowjob', 'hentai',
  'loli', 'pedo', 'pedophile', 'child porn', 'cp',
];

/** French explicit / vulgar terms — substring (lowercase) match. */
export const FRENCH_HIGH_RISK_KEYWORDS: readonly string[] = [
  'sexe', 'baise', 'baiser', 'niquer', 'nique', 'cul', 'bite', 'chatte',
  'pine', 'queue', 'porno', 'viol', 'pédophile', 'pedophile', 'attouchement',
  'zoophile', 'sodomie', 'fellation', 'branlette', 'masturbation', 'orgasme',
  'jouir', 'déshabillé', 'sous-vêtement', 'string', 'bikini',
  'pute', 'salope', 'connard', 'enculé', 'fils de pute', 'putain', 'bordel',
  'bâtard', 'salaud', 'garce',
];

/** Arabic script explicit terms — substring match (no \b — Arabic has no word case). */
export const ARABIC_HIGH_RISK_KEYWORDS: readonly string[] = [
  'سكس', 'جنس', 'نيك', 'كس', 'زب', 'شرموطة', 'قحبة', 'عاهرة', 'متناكة',
  'لوطي', 'لواط', 'سحاق', 'سحاقية', 'اغتصاب', 'تحرش', 'بيدوفيليا',
  'كس اختك', 'دبر', 'شرموط',
];

/** Tunisian Derja Arabizi (Latin + digits) — substring (lowercase) match. */
export const DERJA_ARABIZI_HIGH_RISK: readonly string[] = [
  'nik', 'nayek', 'niki', 'nikni', 'tnayek',
  'kos', 'kosomk', 'kosomek', 'zob', 'zob mok',
  '9a7ba', 'qa7ba', 'qahba', 'kohba', '7chouma',
  'cha9wa', 'sha9wa', 'cha7wa', '5ra', 'kalbi',
];

export const VIOLENT_TEXT_KEYWORDS: readonly string[] = [
  'gun', 'rifle', 'pistol', 'weapon', 'knife', 'bomb', 'grenade', 'shoot', 'kill',
  'arme', 'fusil', 'pistolet', 'couteau', 'tuer',
  'سلاح', 'بندقية', 'سكين', 'قتل',
];

export const DRUG_TEXT_KEYWORDS: readonly string[] = [
  'drug', 'cocaine', 'heroin', 'meth', 'syringe', 'overdose', 'weed', 'marijuana',
  'drogue', 'cocaïne', 'héroïne', 'cannabis',
  'مخدرات', 'حشيش', 'كوكايين',
];

const HIGH_RISK_BOUNDARY_REGEX =
  /\b(porn|sex|adult|nude|xxx|nsfw|fuck|hentai|gun|drug|weapon|baise|niquer|sexe|pute|salope|connard)\b/i;

const RISK_CATEGORIES: RiskCategory[] = ['violent', 'toxic', 'dangerous'];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find explicit high-risk terms across English, French, Arabic and Derja Arabizi.
 */
export function findHighRiskKeywords(text: string): string[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const matched = new Set<string>();

  const allSets: ReadonlyArray<readonly string[]> = [
    HIGH_RISK_KEYWORDS,
    FRENCH_HIGH_RISK_KEYWORDS,
    ARABIC_HIGH_RISK_KEYWORDS,
    DERJA_ARABIZI_HIGH_RISK,
  ];

  for (const set of allSets) {
    for (const kw of set) {
      if (!kw) continue;
      if (containsArabicScript(kw)) {
        if (text.includes(kw)) {
          matched.add(kw);
        }
      } else if (kw.length <= 3) {
        if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text)) {
          matched.add(kw);
        }
      } else if (lower.includes(kw.toLowerCase())) {
        matched.add(kw);
      }
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
 * High-risk scan for Arabic-primary Tesseract output — skips short English tokens
 * and the boundary regex that cause false positives on noisy Arabic OCR.
 */
export function findHighRiskKeywordsForArabicOcr(text: string): string[] {
  if (!text) return [];
  if (!isArabicPrimaryOcrText(text)) {
    return findHighRiskKeywords(text);
  }

  const lower = text.toLowerCase();
  const matched = new Set<string>();

  const sets: ReadonlyArray<readonly string[]> = [
    HIGH_RISK_KEYWORDS.filter((kw) => kw.length > 3),
    FRENCH_HIGH_RISK_KEYWORDS,
    ARABIC_HIGH_RISK_KEYWORDS,
    DERJA_ARABIZI_HIGH_RISK,
  ];

  for (const set of sets) {
    for (const kw of set) {
      if (!kw || shouldSkipLatinKeywordForArabicOcr(text, kw)) continue;
      if (containsArabicScript(kw)) {
        if (text.includes(kw)) matched.add(kw);
      } else if (kw.length <= 3) {
        if (new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text)) matched.add(kw);
      } else if (lower.includes(kw.toLowerCase())) {
        matched.add(kw);
      }
    }
  }

  return [...matched];
}

function keywordMatches(text: string, kw: string): boolean {
  if (shouldSkipLatinKeywordForArabicOcr(text, kw)) return false;
  if (containsArabicScript(kw)) return text.includes(kw);
  const normalized = text.toLowerCase();
  if (kw.length <= 3) {
    return new RegExp(`\\b${escapeRegex(kw)}\\b`, 'i').test(text);
  }
  return normalized.includes(kw.toLowerCase());
}

function scanText(text: string, highRiskFinder: (t: string) => string[] = findHighRiskKeywords): KeywordFilterResult {
  const highRiskHits = highRiskFinder(text);
  if (highRiskHits.length > 0) {
    return { riskFlag: true, category: 'adult', matchedKeywords: highRiskHits };
  }

  const violentHits = VIOLENT_TEXT_KEYWORDS.filter((kw) => keywordMatches(text, kw));
  if (violentHits.length > 0) {
    return { riskFlag: true, category: 'violent', matchedKeywords: violentHits };
  }

  const drugHits = DRUG_TEXT_KEYWORDS.filter((kw) => keywordMatches(text, kw));
  if (drugHits.length > 0) {
    return { riskFlag: true, category: 'dangerous', matchedKeywords: drugHits };
  }

  const matchedKeywords: string[] = [];
  let category: RiskCategory = 'neutral';

  for (const cat of RISK_CATEGORIES) {
    const hits = RISK_KEYWORDS[cat].filter((kw) => keywordMatches(text, kw));
    if (hits.length > 0) {
      matchedKeywords.push(...hits);
      return { riskFlag: true, category: cat, matchedKeywords };
    }
  }

  const eduHits = RISK_KEYWORDS.educational.filter((kw) => keywordMatches(text, kw));
  if (eduHits.length > 0) {
    matchedKeywords.push(...eduHits);
    category = 'educational';
  }

  return { riskFlag: false, category, matchedKeywords };
}

const CATEGORY_RANK: Record<RiskCategory, number> = {
  adult: 5,
  violent: 4,
  dangerous: 3,
  toxic: 2,
  educational: 1,
  neutral: 0,
};

function mergeResults(a: KeywordFilterResult, b: KeywordFilterResult): KeywordFilterResult {
  const winner = CATEGORY_RANK[b.category] > CATEGORY_RANK[a.category] ? b : a;
  const merged = new Set<string>([...a.matchedKeywords, ...b.matchedKeywords]);
  return {
    riskFlag: a.riskFlag || b.riskFlag,
    category: winner.category,
    matchedKeywords: [...merged],
  };
}

/**
 * Multilingual keyword scan (mirrors MobileApp/src/utils/keywordFilter.ts).
 */
export function keywordFilter(
  text: string,
  normalizedText?: string,
): KeywordFilterResult {
  const primary = scanText(text);
  if (!normalizedText || normalizedText === text) {
    return primary;
  }
  const secondary = scanText(normalizedText);
  return mergeResults(primary, secondary);
}

/**
 * Keyword scan tuned for noisy Arabic-primary Tesseract output (debug Arabic OCR).
 */
export function keywordFilterArabicOcr(text: string): KeywordFilterResult {
  return scanText(text, findHighRiskKeywordsForArabicOcr);
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
export function analyzeText(
  text: string,
  normalizedText?: string,
): {
  riskScore: number;
  riskFlag: boolean;
  category: string;
  matchedKeywords: string[];
  rawCategory: RiskCategory;
} {
  const result = keywordFilter(text, normalizedText);
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

/**
 * OCR risk analysis for debug Arabic OCR — suppresses short English false positives.
 */
export function analyzeTextForArabicOcr(text: string): {
  riskScore: number;
  riskFlag: boolean;
  category: string;
  matchedKeywords: string[];
  rawCategory: RiskCategory;
} {
  const result = keywordFilterArabicOcr(text);
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
