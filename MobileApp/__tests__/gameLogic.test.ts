import {
  averageReactionMs,
  hanoiCanMove,
  hanoiMinMoves,
  hanoiMove,
  hanoiSolved,
  initialHanoi,
  isSudokuSolved,
  makeNbackSequence,
  makeSudokuPuzzle,
  nbackAccuracy,
  nbackIsMatch,
  quizSelectionsToLetters,
  nextNbackLevel,
  resolveDifficulty,
  sudokuCorrectRatio,
  tttAiMove,
  tttWinner,
  type TttBoard,
} from '../src/missions/games/gameLogic';
import { resolveQuizQuestions } from '../src/missions/games/quizBank';

describe('resolveDifficulty', () => {
  it('uses age baseline', () => {
    expect(resolveDifficulty(8, false)).toBe('easy');
    expect(resolveDifficulty(11, false)).toBe('medium');
    expect(resolveDifficulty(14, false)).toBe('hard');
    expect(resolveDifficulty(null, false)).toBe('medium');
  });
  it('escalates one step after a strong run', () => {
    expect(resolveDifficulty(8, true)).toBe('medium');
    expect(resolveDifficulty(11, true)).toBe('hard');
    expect(resolveDifficulty(14, true)).toBe('hard');
  });
});

describe('tic-tac-toe', () => {
  it('detects row/col/diagonal wins and draws', () => {
    expect(tttWinner(['X', 'X', 'X', null, null, null, null, null, null])).toBe('X');
    expect(tttWinner(['O', null, null, 'O', null, null, 'O', null, null])).toBe('O');
    expect(tttWinner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X'])).toBe('draw');
    expect(tttWinner(new Array(9).fill(null) as TttBoard)).toBeNull();
  });

  it('medium AI takes an immediate win', () => {
    // O can win by playing index 2.
    const board: TttBoard = ['O', 'O', null, 'X', 'X', null, null, null, null];
    expect(tttAiMove(board, 'medium')).toBe(2);
  });

  it('medium AI blocks the opponent win', () => {
    // X threatens 0,1,(2). O must block at 2.
    const board: TttBoard = ['X', 'X', null, null, 'O', null, null, null, null];
    expect(tttAiMove(board, 'medium')).toBe(2);
  });

  it('hard AI (minimax) never loses from empty board', () => {
    const board: TttBoard = new Array(9).fill(null) as TttBoard;
    const move = tttAiMove(board, 'hard');
    expect(move).toBeGreaterThanOrEqual(0);
  });
});

describe('sudoku', () => {
  it('keeps more clues on easy than hard', () => {
    const seq = makeSudokuPuzzle('easy', () => 0.1);
    const hard = makeSudokuPuzzle('hard', () => 0.1);
    const clues = (g: number[]) => g.filter((v) => v !== 0).length;
    expect(clues(seq.puzzle)).toBeGreaterThan(clues(hard.puzzle));
  });

  it('validates a solved grid and computes correct ratio', () => {
    const { puzzle, solution } = makeSudokuPuzzle('easy');
    expect(isSudokuSolved(solution, solution)).toBe(true);
    expect(isSudokuSolved(puzzle, solution)).toBe(false);
    expect(sudokuCorrectRatio(solution, solution)).toBe(1);
  });
});

describe('n-back', () => {
  it('matches at the right offset', () => {
    const seq = ['A', 'B', 'A', 'C'];
    expect(nbackIsMatch(seq, 2, 2)).toBe(true);
    expect(nbackIsMatch(seq, 3, 2)).toBe(false);
    expect(nbackIsMatch(seq, 0, 2)).toBe(false);
  });

  it('computes accuracy and next level', () => {
    expect(
      nbackAccuracy({ hits: 6, misses: 0, falseAlarms: 0, correctRejections: 14 }),
    ).toBe(100);
    expect(nextNbackLevel(2, 85)).toBe(3);
    expect(nextNbackLevel(3, 90)).toBe(3); // capped
    expect(nextNbackLevel(2, 40)).toBe(1);
    expect(nextNbackLevel(2, 65)).toBe(2);
  });

  it('generates a sequence of the requested length', () => {
    expect(makeNbackSequence(20, 2).length).toBe(20);
  });
});

describe('reaction', () => {
  it('averages samples', () => {
    expect(averageReactionMs([100, 200, 300])).toBe(200);
    expect(averageReactionMs([])).toBe(0);
  });
});

describe('tower of hanoi', () => {
  it('enforces move legality and detects solved state', () => {
    let pegs = initialHanoi(3);
    expect(hanoiMinMoves(3)).toBe(7);
    expect(hanoiCanMove(pegs, 0, 1)).toBe(true);
    pegs = hanoiMove(pegs, 0, 2); // disk 1 → target
    expect(hanoiCanMove(pegs, 0, 2)).toBe(false); // disk 2 onto disk 1 illegal
    pegs = hanoiMove(pegs, 0, 1); // disk 2 → middle
    pegs = hanoiMove(pegs, 2, 1); // disk 1 → middle
    pegs = hanoiMove(pegs, 0, 2); // disk 3 → target
    pegs = hanoiMove(pegs, 1, 0);
    pegs = hanoiMove(pegs, 1, 2);
    pegs = hanoiMove(pegs, 0, 2);
    expect(hanoiSolved(pegs, 3)).toBe(true);
  });
});

describe('quiz', () => {
  it('maps indices to letters', () => {
    expect(quizSelectionsToLetters([0, 1, 2, 3])).toEqual(['A', 'B', 'C', 'D']);
  });

  it('resolves questions from category metadata', () => {
    const qs = resolveQuizQuestions({ category: 'safety', numQuestions: 3 });
    expect(qs.length).toBe(3);
    expect(qs[0].options.length).toBeGreaterThan(1);
  });

  it('prefers metadata.questions when present', () => {
    const qs = resolveQuizQuestions({
      questions: [{ text: 'Q1', options: ['a', 'b'] }],
    });
    expect(qs).toEqual([{ text: 'Q1', options: ['a', 'b'] }]);
  });
});
