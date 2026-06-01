import { evaluateMissionCompletion } from '../src/services/missionCompletion';

describe('Sprint 5 mission approval flow', () => {
  it('real_world completion validates with confirmed true', () => {
    const result = evaluateMissionCompletion(
      'real_world',
      { action: 'jumping_jacks' },
      20,
      { confirmed: true },
    );
    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(20);
  });

  it('quiz completion awards points when answers match', () => {
    const result = evaluateMissionCompletion(
      'quiz',
      { correctAnswers: ['A', 'B', 'A'] },
      30,
      { answers: ['A', 'B', 'A'] },
    );
    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBeGreaterThan(0);
  });

  it('cognitive nback awards proportional points', () => {
    const result = evaluateMissionCompletion(
      'cognitive',
      { exercise: 'nback' },
      30,
      { exerciseScore: 100 },
    );
    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(30);
  });
});
