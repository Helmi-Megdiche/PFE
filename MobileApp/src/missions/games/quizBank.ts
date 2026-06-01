/**
 * Playable quiz questions. Options are ordered so the correct option sits at the
 * letter position the backend expects (templates store `correctAnswers` like
 * ['A','B','A']). The mobile quiz sends the selected option letters, which the
 * backend compares against those `correctAnswers`.
 */

export interface QuizQuestion {
  text: string;
  options: string[]; // index 0 → 'A', 1 → 'B', ...
}

/** category (from mission metadata) → ordered questions. */
const QUIZ_BANK: Record<string, QuizQuestion[]> = {
  // quiz_safety — correctAnswers ['A','B','A']
  safety: [
    {
      text: 'A stranger online asks for your home address. What do you do?',
      options: [
        'Refuse and tell a parent', // A ✓
        'Send it if they seem nice',
        'Post it publicly',
      ],
    },
    {
      text: 'You receive a link from someone you do not know. You should…',
      options: [
        'Click it right away',
        'Not click it and tell an adult', // B ✓
        'Share it with friends',
      ],
    },
    {
      text: 'Someone is being mean to you in a game chat. Best response?',
      options: [
        'Block/report and tell a parent', // A ✓
        'Send mean messages back',
        'Give them your password',
      ],
    },
  ],
  // conflict_resolution_quiz — correctAnswers ['A','B','C']
  conflict: [
    {
      text: 'You and a friend disagree about a game. The best first step is…',
      options: [
        'Listen to their side calmly', // A ✓
        'Stop being friends',
        'Yell until they agree',
      ],
    },
    {
      text: 'You feel angry during an argument. A healthy choice is to…',
      options: [
        'Break something',
        'Take a deep breath and pause', // B ✓
        'Say hurtful things',
      ],
    },
    {
      text: 'After a fight with a sibling, a good way to fix it is to…',
      options: [
        'Ignore them for a week',
        'Blame them to your parents',
        'Talk it out and apologise if needed', // C ✓
      ],
    },
  ],
  // empathy_exercise — correctAnswers ['A','B']
  empathy: [
    {
      text: 'A classmate looks sad at lunch. The kind thing to do is…',
      options: [
        'Ask if they are okay', // A ✓
        'Laugh at them',
      ],
    },
    {
      text: 'Your friend lost their pet. How might they feel?',
      options: [
        'Happy and excited',
        'Sad and in need of comfort', // B ✓
      ],
    },
  ],
};

const DEFAULT_QUESTIONS: QuizQuestion[] = QUIZ_BANK.safety;

/**
 * Resolve questions for a mission. Prefers metadata.questions if present,
 * else the category bank, else a safety fallback.
 */
export function resolveQuizQuestions(
  metadata: Record<string, unknown>,
): QuizQuestion[] {
  const fromMeta = metadata.questions;
  if (Array.isArray(fromMeta) && fromMeta.length > 0) {
    return fromMeta
      .map((q) => {
        const obj = q as { text?: unknown; options?: unknown };
        if (typeof obj.text === 'string' && Array.isArray(obj.options)) {
          return {
            text: obj.text,
            options: obj.options.map((o) => String(o)),
          };
        }
        return null;
      })
      .filter((q): q is QuizQuestion => q !== null);
  }

  const category = String(metadata.category ?? '').toLowerCase();
  const bank = QUIZ_BANK[category];
  if (bank) {
    const numQuestions = Number(metadata.numQuestions ?? bank.length);
    return bank.slice(0, numQuestions);
  }
  return DEFAULT_QUESTIONS;
}
