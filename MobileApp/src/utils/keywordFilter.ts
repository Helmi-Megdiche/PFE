import { RISK_KEYWORDS } from '../constants/riskKeywords';
import { findAdultSiteMatches } from './adultSiteContext';
import { applyBenignKeywordContext } from './benignRiskContext';
import { applyRiskySearchBoost } from './riskySearchContext';
import { containsArabicScript, normalizeArabizi } from './normalizeArabizi';

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

/** Tunisian Derja (Latin/Arabizi + Arabic script) — substring match. */
export const DERJA_ARABIZI_HIGH_RISK: readonly string[] = [
  // Core sexual / insult (Latin + digit Arabizi)
  'nik', 'nayek', 'niki', 'nikni', 'tnayek', 'mnayek', 'mnaykin', 'mnaykyn', 'mnaikin',
  'mnayeq', 'niklek', 'maniklek', 'mounek', 'manyouk', 'mounekin', 'mounekyn',
  'nek', 'ynik', 'inik', 'neketni', 'nektouna', 'nektoulha', 'neketekni',
  'kos', 'kosomk', 'kosomtek', 'kosomek',
  'zob', 'zob mok', 'zeb', 'zebi', 'zebek', 'zebou', 'zebna', 'zeby', 'zboubna',
  '9a7ba', 'qa7ba', 'qahba', 'kohba', '7chouma', 'cha9wa', 'sha9wa', 'cha7wa',
  '5ra', 'kalbi', '3oss', 'miboun', 'tahan', 'ta7an',
  'mankoun', 'man9oub', 'sorm', 'sormek', 'nouna', 'sorm ommek', 'sorm omek', 'nami',
  'te7chi fih', 'tehchi fih', 'te7chi', 'tehchi', 'yehchi', 'ye7chi',
  'weben', 'maklout', 'mal9out', 'asba', '3asba', 'jaabek', 'ja3bek', 'ja3b',
  'bazoula', 'bzezel', 'bazla', 'ras zebi', 'karazet', 'karazetni', 'karrez', 'karez',
  'krarez', 'krarzi', 'korza', 'mestakrez', 'khrit fih',
  // Hach / shame family
  'hachweji', '7achweji', 'yehchih', 'ye7chih', 'hachih', '7achih',
  'hachihoulou', '7achihoulou', 'hachihouli', '7achihouli',
  'hachihoulek', '7achihoulek', 'hchithelek', '7chithelek',
  'hchehelna', '7chehelna', 'metehchelek', 'mete7chelek',
  'tehchelek', 'te7chelek',
  // Research report additions
  'nshammshi', 'nchammshi', 'nšammši', 'batruna', 'batrouna',
  'lahhas', 'la7has', 'l7as', 'mkhannas', 'm5annis', 'khannes', 'mkhannith',
  '3abd', '3abed', '3abid', 'na3l', 'naala', 'zatla', 'chrab',
  '9hab',
  // Arabic script (Tesseract / native Arabic OCR)
  'قحبة', 'ولد القحبة', 'لحاس', 'زب', 'نيك', 'مخنث', 'ميبون', 'نشّمشي', 'نعّل',
  'الزاب', 'الزوبة', 'الزبي', 'المنيك', 'المنيوك', 'الزبانة', 'الشرموطة',
  'القحاب', 'الخو', 'اللوطي', 'اللواط', 'السحاق', 'البعبوص',
];

export const VIOLENT_TEXT_KEYWORDS: readonly string[] = [
  'gun', 'rifle', 'pistol', 'weapon', 'knife', 'bomb', 'grenade', 'shoot', 'kill', 'murder',
  'gore', 'gory', 'blood', 'massacre', 'behead', 'dismember', 'mutilation', 'corpse', 'brutal',
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
      } else if (kw.length <= 4 && !containsArabicScript(kw)) {
        // Avoid substring hits like "pute" inside "computer".
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

  for (const site of findAdultSiteMatches(text)) {
    matched.add(site);
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
  let merged = applyBenignKeywordContext(text, scanText(text));
  const autoNormalized = normalizeArabizi(text);
  if (autoNormalized && autoNormalized !== text.toLowerCase()) {
    merged = mergeResults(
      merged,
      applyBenignKeywordContext(autoNormalized, scanText(autoNormalized)),
    );
  }
  if (
    normalizedText &&
    normalizedText !== text &&
    normalizedText !== autoNormalized
  ) {
    merged = mergeResults(
      merged,
      applyBenignKeywordContext(normalizedText, scanText(normalizedText)),
    );
  }
  merged = applyRiskySearchBoost(text, merged);
  // Benign pass last — design-tool / SafeSearch pages may contain "nsfw" on google.com/sear.
  return applyBenignKeywordContext(text, merged);
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
