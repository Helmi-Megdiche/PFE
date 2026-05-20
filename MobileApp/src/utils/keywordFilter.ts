import { RISK_KEYWORDS } from '../constants/riskKeywords';
import { containsArabicScript } from './normalizeArabizi';

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

/** English explicit terms — short ones use \b word boundary. */
export const HIGH_RISK_KEYWORDS: readonly string[] = [
  'porn', 'xxx', 'nsfw', 'sex', 'adult', 'nude', 'naked', 'fuck', 'bitch',
  'shit', 'ass', 'dick', 'pussy', 'orgy', 'cum', 'blowjob', 'hentai',
  'loli', 'pedo', 'pedophile', 'child porn', 'cp',
];

/** French explicit / vulgar terms — substring (lowercase) match. */
export const FRENCH_HIGH_RISK_KEYWORDS: readonly string[] = [
  // Sexuel
  'sexe', 'baise', 'baiser', 'niquer', 'nique', 'cul', 'bite', 'chatte',
  'pine', 'queue', 'porno', 'viol', 'pédophile', 'pedophile', 'attouchement',
  'zoophile', 'sodomie', 'fellation', 'branlette', 'masturbation', 'orgasme',
  'jouir', 'déshabillé', 'sous-vêtement', 'string', 'bikini',
  // Insultes
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

function scanText(text: string): KeywordFilterResult {
  const highRiskHits = findHighRiskKeywords(text);
  if (highRiskHits.length > 0) {
    return { riskFlag: true, category: 'adult', matchedKeywords: highRiskHits };
  }

  const normalized = text.toLowerCase();

  const violentHits = VIOLENT_TEXT_KEYWORDS.filter((kw) =>
    containsArabicScript(kw) ? text.includes(kw) : normalized.includes(kw.toLowerCase()),
  );
  if (violentHits.length > 0) {
    return { riskFlag: true, category: 'violent', matchedKeywords: violentHits };
  }

  const drugHits = DRUG_TEXT_KEYWORDS.filter((kw) =>
    containsArabicScript(kw) ? text.includes(kw) : normalized.includes(kw.toLowerCase()),
  );
  if (drugHits.length > 0) {
    return { riskFlag: true, category: 'dangerous', matchedKeywords: drugHits };
  }

  const matchedKeywords: string[] = [];
  let category: RiskCategory = 'neutral';

  for (const cat of RISK_CATEGORIES) {
    const hits = RISK_KEYWORDS[cat].filter((kw) =>
      containsArabicScript(kw) ? text.includes(kw) : normalized.includes(kw.toLowerCase()),
    );
    if (hits.length > 0) {
      matchedKeywords.push(...hits);
      return { riskFlag: true, category: cat, matchedKeywords };
    }
  }

  const eduHits = RISK_KEYWORDS.educational.filter((kw) =>
    containsArabicScript(kw) ? text.includes(kw) : normalized.includes(kw.toLowerCase()),
  );
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
 * Multilingual keyword scan. Pass `normalizedText` (Arabizi → quasi-Arabic)
 * to catch Derja content the primary OCR pass might miss.
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

/** Backend parity alias (mirrors `backend/src/utils/keywordFilter.ts#analyzeText`). */
export function analyzeText(
  text: string,
  normalizedText?: string,
): KeywordFilterResult & { riskScore: number } {
  const result = keywordFilter(text, normalizedText);
  const score = result.category === 'adult'
    ? Math.min(100, Math.max(70, 50 + result.matchedKeywords.length * 12))
    : result.riskFlag
      ? Math.min(100, 50 + result.matchedKeywords.length * 12)
      : result.category === 'educational'
        ? 15
        : 5;
  return { ...result, riskScore: score };
}
