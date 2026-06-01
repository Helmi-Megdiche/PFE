/**
 * Suppress keyword false positives when "nsfw" / "adult" appear in parental-control
 * settings, design-tool filters, or the project's own parent dashboard OCR.
 */

const ADULT_KEYWORD_SET = new Set([
  'porn',
  'hentai',
  'xxx',
  'nsfw',
  'nude',
  'sex',
  'adult',
]);

/** Parental-control / marketplace filter UI (e.g. Fiverr SafeSearch). */
function isParentalControlNsfwContext(lower: string): boolean {
  if (!/\bnsfw\b/i.test(lower)) {
    return false;
  }
  return (
    /\b(safesearch|safe\s*search)\b/i.test(lower) ||
    /\b(désactiver|desactiver|disable|désactivé|desactive|activer|enable)\b/i.test(lower) ||
    /\b(fiverr|content\s*filter|parental|family\s*filter|filter\s*content)\b/i.test(lower) ||
    /\b(dessiner|designer|personnage|character\s*design)\b/i.test(lower)
  );
}

/** OCR of demo_dashboard / gamification parent tools. */
function isOwnGamificationDashboardContext(lower: string): boolean {
  const dashboardHints =
    /\b(missions?|bonus\s+points?|pending\s+approval|custom\s+mission|escape\s+log|mission\s+history|gamification|parent\s+tools|rewards?\s+management)\b/i.test(
      lower,
    );
  const activityHints =
    /\b(completed|approve|reject|points?\s+pts|real[_\s-]?world|award\s+bonus)\b/i.test(lower);
  return dashboardHints && activityHints;
}

/**
 * Remove matched keywords that are benign in context. Returns filtered list.
 */
export function filterBenignKeywordMatches(
  text: string,
  matchedKeywords: string[],
): string[] {
  if (!matchedKeywords.length) {
    return matchedKeywords;
  }
  const lower = text.toLowerCase();
  const parentalUi = isParentalControlNsfwContext(lower);
  const ownDashboard = isOwnGamificationDashboardContext(lower);

  if (!parentalUi && !ownDashboard) {
    return matchedKeywords;
  }

  return matchedKeywords.filter((kw) => {
    const k = kw.toLowerCase();
    if (parentalUi && (k === 'nsfw' || k === 'adult')) {
      return false;
    }
    if (ownDashboard && ADULT_KEYWORD_SET.has(k)) {
      return false;
    }
    return true;
  });
}

export interface BenignKeywordFilterResult {
  riskFlag: boolean;
  category: 'violent' | 'toxic' | 'dangerous' | 'educational' | 'adult' | 'neutral';
  matchedKeywords: string[];
}

/**
 * Recompute keyword filter outcome after removing benign-context matches.
 */
export function applyBenignKeywordContext<T extends BenignKeywordFilterResult>(
  text: string,
  result: T,
): T {
  const matchedKeywords = filterBenignKeywordMatches(text, result.matchedKeywords);
  if (matchedKeywords.length === result.matchedKeywords.length) {
    return result;
  }
  if (matchedKeywords.length === 0) {
    return {
      ...result,
      riskFlag: false,
      category: 'neutral',
      matchedKeywords: [],
    };
  }
  const stillAdult = matchedKeywords.some((k) => ADULT_KEYWORD_SET.has(k.toLowerCase()));
  return {
    ...result,
    matchedKeywords,
    category: stillAdult ? 'adult' : result.category,
    riskFlag: true,
  };
}
