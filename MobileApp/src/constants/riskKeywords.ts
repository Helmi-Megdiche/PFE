/** Fallback keyword lists until TFLite classifier is integrated (Sprint 3). */
export const RISK_KEYWORDS: Record<string, readonly string[]> = {
  violent: [
    'kill', 'murder', 'gun', 'weapon', 'blood', 'stab', 'fight', 'assault',
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
