import { evaluateMissionCompletion } from '../src/services/missionCompletion';

describe('evaluateMissionCompletion', () => {
  it('scores nback proportionally to exerciseScore', () => {
    const result = evaluateMissionCompletion(
      'cognitive',
      { exercise: 'nback' },
      30,
      { exerciseScore: 80 },
    );
    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(24);
  });

  it('scores reaction time with tiered points', () => {
    const fast = evaluateMissionCompletion(
      'cognitive',
      { exercise: 'reaction' },
      25,
      { reactionTimeMs: 250 },
    );
    const slow = evaluateMissionCompletion(
      'cognitive',
      { exercise: 'reaction' },
      25,
      { reactionTimeMs: 600 },
    );
    expect(fast.pointsAwarded).toBe(25);
    expect(slow.pointsAwarded).toBe(12);
  });

  it('awards bonus for optimal Tower of Hanoi moves', () => {
    const result = evaluateMissionCompletion(
      'cognitive',
      { exercise: 'hanoi', disks: 3 },
      40,
      { moves: 7 },
    );
    expect(result.success).toBe(true);
    expect(result.pointsAwarded).toBe(50);
    expect(result.completionData.optimal).toBe(true);
  });

  it('validates quiz answers with pass threshold', () => {
    const pass = evaluateMissionCompletion(
      'quiz',
      { correctAnswers: ['A', 'B', 'A'] },
      30,
      { answers: ['A', 'B', 'C'] },
    );
    expect(pass.success).toBe(true);
    expect(pass.pointsAwarded).toBeGreaterThan(0);

    const fail = evaluateMissionCompletion(
      'quiz',
      { correctAnswers: ['A', 'B', 'A'] },
      30,
      { answers: ['C', 'C', 'C'] },
    );
    expect(fail.success).toBe(false);
  });

  it('requires confirmation for real-world missions', () => {
    const ok = evaluateMissionCompletion(
      'real_world',
      { action: 'jumping_jacks' },
      20,
      { confirmed: true },
    );
    const no = evaluateMissionCompletion(
      'real_world',
      { action: 'jumping_jacks' },
      20,
      { confirmed: false },
    );
    expect(ok.pointsAwarded).toBe(20);
    expect(no.success).toBe(false);
  });
});
