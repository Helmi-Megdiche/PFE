/** Keyword lists for OCR risk (mirrors MobileApp/src/constants/riskKeywords.ts). */
export const RISK_KEYWORDS: Record<string, readonly string[]> = {
  violent: [
    'kill', 'murder', 'gun', 'weapon', 'blood', 'gore', 'gory', 'stab', 'fight', 'assault',
    'massacre', 'behead', 'dismember', 'mutilation', 'corpse', 'brutal',
    'tuer', 'arme', 'sang', 'combat',
  ],
  toxic: [
    'hate', 'stupid', 'idiot', 'loser', 'ugly', 'die', 'kys',
    'connard', 'nul', 'haine', 'insulte',
  ],
  dangerous: [
    'challenge', 'choking', 'blackout', 'self-harm', 'suicide', 'cutting',
    'défi', 'étouffer', 'automutilation',
  ],
  educational: [
    'learn', 'lesson', 'homework', 'quiz', 'science', 'math',
    'apprendre', 'cours', 'devoir', 'mathématiques',
  ],
};
