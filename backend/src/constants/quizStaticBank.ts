/** Static quiz fallback when DB bank is empty (mirrors MobileApp quizBank.ts). */

export interface StaticQuizQuestion {
  text: string;
  options: string[];
}

const STATIC_BANK: Record<string, StaticQuizQuestion[]> = {
  safety: [
    {
      text: 'A stranger online asks for your home address. What do you do?',
      options: [
        'Refuse and tell a parent',
        'Send it if they seem nice',
        'Post it publicly',
      ],
    },
    {
      text: 'You receive a link from someone you do not know. You should…',
      options: [
        'Click it right away',
        'Not click it and tell an adult',
        'Share it with friends',
      ],
    },
    {
      text: 'Someone is being mean to you in a game chat. Best response?',
      options: [
        'Block/report and tell a parent',
        'Send mean messages back',
        'Give them your password',
      ],
    },
  ],
  media_violence: [
    {
      text: 'You see a graphic violent video online. What should you do first?',
      options: [
        'Share it with friends',
        'Close it and tell a trusted adult',
        'Watch more to understand',
        'Save it for later',
      ],
    },
    {
      text: 'Why is it harmful to share violent or gore images?',
      options: [
        'It can upset people and get you in trouble',
        'Everyone loves them',
        'It makes you famous',
        'It is always allowed online',
      ],
    },
    {
      text: 'You searched for violent images out of curiosity. A better choice next time is to…',
      options: [
        'Search for more',
        'Ask a parent why that content is harmful',
        'Post what you found',
        'Ignore your feelings',
      ],
    },
  ],
  conflict: [
    {
      text: 'You and a friend disagree about a game. The best first step is…',
      options: [
        'Listen to their side calmly',
        'Stop being friends',
        'Yell until they agree',
      ],
    },
    {
      text: 'You feel angry during an argument. A healthy choice is to…',
      options: ['Break something', 'Take a deep breath and pause', 'Say hurtful things'],
    },
    {
      text: 'After a fight with a sibling, a good way to fix it is to…',
      options: [
        'Ignore them for a week',
        'Blame them to your parents',
        'Talk it out and apologise if needed',
      ],
    },
  ],
  empathy: [
    {
      text: 'A classmate looks sad at lunch. The kind thing to do is…',
      options: ['Ask if they are okay', 'Laugh at them'],
    },
    {
      text: 'Your friend lost their pet. How might they feel?',
      options: ['Happy and excited', 'Sad and in need of comfort'],
    },
  ],
};

const CORRECT_ANSWERS: Record<string, string[]> = {
  safety: ['A', 'B', 'A'],
  media_violence: ['B', 'A', 'B'],
  conflict: ['A', 'B', 'C'],
  empathy: ['A', 'B'],
};

export function getStaticQuizFallback(
  quizType: string,
  numQuestions: number,
): { questions: StaticQuizQuestion[]; correctAnswers: string[] } | null {
  const bank = STATIC_BANK[quizType];
  if (!bank?.length) {
    return null;
  }
  const questions = bank.slice(0, Math.max(1, numQuestions));
  const correct = (CORRECT_ANSWERS[quizType] ?? []).slice(0, questions.length);
  return { questions, correctAnswers: correct };
}
