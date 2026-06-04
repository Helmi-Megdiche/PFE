import { getStaticQuizFallback } from '../constants/quizStaticBank';
import { query } from '../db/pool';

export interface QuizMissionTemplate {
  type: string;
  title: string;
  description: string;
  points: number;
  metadata: Record<string, unknown>;
}

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface QuizQuestionRow {
  id: string;
  question_text: string;
  options: string[];
  correct_answer_index: number;
}

export interface QuizValidationResult {
  score: number;
  passed: boolean;
  correctCount: number;
  total: number;
}

const QUIZ_TEMPLATE_TYPES: Record<string, string> = {
  quiz_safety: 'safety',
  quiz_media_violence: 'media_violence',
  conflict_resolution_quiz: 'conflict',
  empathy_exercise: 'empathy',
};

export function indexToAnswerLetter(index: number): string {
  return ANSWER_LETTERS[index] ?? 'A';
}

/** Fetch random age-appropriate questions for a quiz type. */
export async function getRandomQuestions(
  quizType: string,
  childAge: number,
  limit = 3,
): Promise<QuizQuestionRow[]> {
  const { rows } = await query<QuizQuestionRow>(
    `SELECT id, question_text, options, correct_answer_index
     FROM quiz_questions
     WHERE quiz_type = $1
       AND $2 BETWEEN age_min AND age_max
     ORDER BY RANDOM()
     LIMIT $3`,
    [quizType, childAge, limit],
  );
  return rows;
}

/** Map DB rows to mission metadata consumed by the mobile quiz UI. */
export function mapQuestionsForMetadata(rows: QuizQuestionRow[]): {
  questions: { text: string; options: string[] }[];
  correctAnswers: string[];
} {
  return {
    questions: rows.map((q) => ({
      text: q.question_text,
      options: q.options,
    })),
    correctAnswers: rows.map((q) => indexToAnswerLetter(q.correct_answer_index)),
  };
}

/** Validate selected option indices against fetched questions. */
export function validateQuizAnswers(
  questions: QuizQuestionRow[],
  answers: number[],
): QuizValidationResult {
  const total = questions.length;
  if (total === 0) {
    return { score: 0, passed: false, correctCount: 0, total: 0 };
  }
  let correctCount = 0;
  for (let i = 0; i < questions.length; i += 1) {
    if (answers[i] === questions[i].correct_answer_index) {
      correctCount += 1;
    }
  }
  const score = correctCount / total;
  const passed = correctCount >= Math.ceil(total * (2 / 3));
  return { score, passed, correctCount, total };
}

/**
 * Attach DB-backed questions to a quiz mission template when available.
 * Falls back to static template metadata if the bank returns no rows.
 */
export async function enrichQuizMetadata(
  templateKey: string,
  template: QuizMissionTemplate,
  childAge: number | null,
): Promise<QuizMissionTemplate> {
  const quizType = QUIZ_TEMPLATE_TYPES[templateKey];
  if (!quizType) {
    return template;
  }
  const age = childAge ?? 12;
  const numQuestions = Number(template.metadata.numQuestions ?? 3);
  const rows = await getRandomQuestions(quizType, age, numQuestions);
  if (rows.length > 0) {
    const { questions, correctAnswers } = mapQuestionsForMetadata(rows);
    return {
      ...template,
      metadata: {
        ...template.metadata,
        category: quizType,
        questions,
        correctAnswers,
        numQuestions: questions.length,
        questionIds: rows.map((r) => r.id),
      },
    };
  }

  const fallback = getStaticQuizFallback(quizType, numQuestions);
  if (fallback) {
    return {
      ...template,
      metadata: {
        ...template.metadata,
        category: quizType,
        questions: fallback.questions,
        correctAnswers: fallback.correctAnswers,
        numQuestions: fallback.questions.length,
        questionSource: 'static_fallback',
      },
    };
  }

  return template;
}
