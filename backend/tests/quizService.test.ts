import {
  enrichQuizMetadata,
  getRandomQuestions,
  mapQuestionsForMetadata,
  validateQuizAnswers,
  indexToAnswerLetter,
} from '../src/services/quizService';

jest.mock('../src/db/pool', () => ({
  query: jest.fn(),
}));

import { query } from '../src/db/pool';

const mockedQuery = query as jest.Mock;

describe('quizService', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it('maps answer index to letter', () => {
    expect(indexToAnswerLetter(0)).toBe('A');
    expect(indexToAnswerLetter(2)).toBe('C');
  });

  it('fetches random questions for quiz type and age', async () => {
    mockedQuery.mockResolvedValue({
      rows: [
        {
          id: 'q1',
          question_text: 'Test?',
          options: ['a', 'b', 'c', 'd'],
          correct_answer_index: 1,
        },
      ],
    });

    const rows = await getRandomQuestions('safety', 12, 3);
    expect(rows).toHaveLength(1);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('quiz_questions'),
      ['safety', 12, 3],
    );
  });

  it('maps rows to mobile metadata shape', () => {
    const meta = mapQuestionsForMetadata([
      {
        id: 'q1',
        question_text: 'Q1',
        options: ['A1', 'B1'],
        correct_answer_index: 1,
      },
    ]);
    expect(meta.questions[0].text).toBe('Q1');
    expect(meta.correctAnswers).toEqual(['B']);
  });

  it('validates quiz answers with pass threshold', () => {
    const questions = [
      { id: '1', question_text: 'a', options: [], correct_answer_index: 0 },
      { id: '2', question_text: 'b', options: [], correct_answer_index: 1 },
      { id: '3', question_text: 'c', options: [], correct_answer_index: 2 },
    ];
    const pass = validateQuizAnswers(questions, [0, 1, 2]);
    expect(pass.passed).toBe(true);
    expect(pass.score).toBe(1);

    const fail = validateQuizAnswers(questions, [1, 1, 1]);
    expect(fail.passed).toBe(false);
    expect(fail.correctCount).toBe(1);
  });

  it('uses static fallback when DB returns no quiz rows', async () => {
    mockedQuery.mockResolvedValue({ rows: [] });
    const template = {
      type: 'quiz',
      title: 'Media & Violence Quiz',
      description: 'Answer 3 questions',
      points: 30,
      metadata: { category: 'media_violence', numQuestions: 3 },
    };
    const enriched = await enrichQuizMetadata('quiz_media_violence', template, 12);
    expect(enriched.metadata.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: expect.stringContaining('graphic violent video') }),
      ]),
    );
    expect(enriched.metadata.questionSource).toBe('static_fallback');
  });
});
