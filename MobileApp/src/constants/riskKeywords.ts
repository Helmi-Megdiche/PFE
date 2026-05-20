/**
 * Multilingual risk keyword lists (English + French + Arabic + Tunisian Derja Arabizi).
 * Combined with `HIGH_RISK_KEYWORDS` in `keywordFilter.ts` and the on-device NSFW TFLite
 * model in `nsfwClassifier.ts`.
 */
export const RISK_KEYWORDS: Record<string, readonly string[]> = {
  violent: [
    // English
    'kill', 'murder', 'gun', 'weapon', 'blood', 'stab', 'fight', 'assault',
    // French
    'tuer', 'arme', 'sang', 'combat', 'meurtre', 'assassinat', 'flingue',
    'couteau', 'égorger', 'poignarder', 'attentat',
    // Arabic
    'قتل', 'ذبح', 'سلاح', 'بندقية', 'سكين', 'دم', 'جرح', 'انفجار',
  ],
  toxic: [
    // English
    'hate', 'stupid', 'idiot', 'loser', 'ugly', 'die', 'kys',
    // French
    'connard', 'nul', 'haine', 'insulte', 'salaud', 'salope', 'pute',
    'putain', 'garce', 'enculé', 'bâtard',
    // Arabic
    'كلب', 'خنزير', 'حمار', 'قرد', 'ابن الكلب',
  ],
  dangerous: [
    // English
    'challenge', 'choking', 'blackout', 'self-harm', 'suicide', 'cutting',
    // French
    'défi', 'étouffer', 'automutilation', 'suicide', 'overdose',
    // Drugs (multi-lang)
    'drogue', 'cocaïne', 'héroïne', 'cannabis', 'ecstasy', 'mdma', 'joint',
    'مخدرات', 'حشيش', 'كوكايين', 'خمر', 'مسكر',
  ],
  educational: [
    // English
    'learn', 'lesson', 'homework', 'quiz', 'science', 'math',
    // French
    'apprendre', 'cours', 'devoir', 'mathématiques', 'leçon', 'école',
    // Arabic
    'تعلم', 'درس', 'مدرسة', 'واجب', 'علوم', 'رياضيات',
  ],
};
