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

/** Our blocking mission overlay / in-app MissionScreen (avoid self-OCR loops). */
function isMissionBlockingOverlayContext(lower: string): boolean {
  return (
    /\bactive\s+mission\b/i.test(lower) &&
    /\b(quiz|minigame|cognitive|safety\s+quiz|answer\s+\d+\s+question|points?\s+·|points?\s+pts)\b/i.test(
      lower,
    )
  );
}

/** In-app mission / game UI OCR (Tic-Tac-Toe, N-back, rewards tab, etc.). */
export function isMissionGameUiContext(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(tic-tac-toe|n-back|memory challenge|beat the computer|minigame|cognitive|your points|rewards?)\b/i.test(
      lower,
    ) ||
    /\b(question\s+\d+\s*\/\s*\d+|points?\s+quiz|online safety quiz)\b/i.test(lower)
  );
}

/** Do not POST screen events for our own mission UI captured in screenshots. */
export function shouldSkipScreenEventReporting(text: string): boolean {
  const lower = text.toLowerCase();
  if (isMissionGameUiContext(text)) {
    return true;
  }
  if (isOwnScreenMonitorContext(lower)) {
    return true;
  }
  if (
    /\b(memory challenge|online safety quiz|play n-back)\b/i.test(lower) &&
    /\b(points?\s+quiz|points?\s+cognitive|cognitive|question\s+\d)\b/i.test(lower)
  ) {
    return true;
  }
  return false;
}

/** Home launcher widgets (Discord, Instagram previews) without explicit adult URLs. */
function isHomeFeedLauncherContext(lower: string): boolean {
  const socialFeed =
    /\b(discord\.gg|instagram|whatsapp|snapchat|messenger|friends|followers)\b/i.test(
      lower,
    );
  const explicitAdult =
    /\b(pornhub|xvideos|porn|xxx|nsfw|hentai|brazzers|sislovesme)\b/i.test(lower);
  return socialFeed && !explicitAdult;
}

/** SafeGuard monitor tab — avoid self-capture noise in parent dashboard. */
function isOwnScreenMonitorContext(lower: string): boolean {
  return (
    /\bscreen\s+monitoring\b/i.test(lower) &&
    /\b(on-device\s+ocr|captures?\s+on\s+app\s+switch|vision)\b/i.test(lower)
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
  if (shouldSkipScreenEventReporting(text)) {
    return [];
  }

  const parentalUi = isParentalControlNsfwContext(lower);
  const ownDashboard = isOwnGamificationDashboardContext(lower);
  const missionOverlay = isMissionBlockingOverlayContext(lower);
  const homeFeed = isHomeFeedLauncherContext(lower);

  if (!parentalUi && !ownDashboard && !missionOverlay && !homeFeed) {
    return matchedKeywords;
  }

  return matchedKeywords.filter((kw) => {
    const k = kw.toLowerCase();
    if ((parentalUi || homeFeed) && (k === 'nsfw' || k === 'adult')) {
      return false;
    }
    if (homeFeed && (k === 'porn' || k === 'sex' || k === 'blowjob')) {
      return false;
    }
    if ((ownDashboard || missionOverlay) && ADULT_KEYWORD_SET.has(k)) {
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
