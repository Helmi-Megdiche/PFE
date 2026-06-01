/**
 * Pure, unit-testable game logic shared by the mission mini-games.
 * No React / native imports here so it can be tested with plain Jest.
 */

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Baseline difficulty from age, optionally bumped by prior performance. */
export function resolveDifficulty(
  age: number | null,
  lastSuccessHighScore: boolean,
): Difficulty {
  let base: Difficulty;
  if (age == null) {
    base = 'medium';
  } else if (age < 10) {
    base = 'easy';
  } else if (age >= 13) {
    base = 'hard';
  } else {
    base = 'medium';
  }
  if (!lastSuccessHighScore) {
    return base;
  }
  // Escalate one step after a strong previous run.
  if (base === 'easy') return 'medium';
  if (base === 'medium') return 'hard';
  return 'hard';
}

// ---------------------------------------------------------------------------
// Tic-Tac-Toe
// ---------------------------------------------------------------------------

export type TttCell = 'X' | 'O' | null;
export type TttBoard = TttCell[]; // length 9

export const TTT_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function tttWinner(board: TttBoard): TttCell | 'draw' | null {
  for (const [a, b, c] of TTT_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }
  if (board.every((c) => c !== null)) {
    return 'draw';
  }
  return null;
}

function emptyIndices(board: TttBoard): number[] {
  const out: number[] = [];
  board.forEach((c, i) => {
    if (c === null) out.push(i);
  });
  return out;
}

/** Minimax score for the 'O' (AI) player. */
function minimax(board: TttBoard, isAiTurn: boolean): number {
  const w = tttWinner(board);
  if (w === 'O') return 10;
  if (w === 'X') return -10;
  if (w === 'draw') return 0;

  const moves = emptyIndices(board);
  if (isAiTurn) {
    let best = -Infinity;
    for (const i of moves) {
      board[i] = 'O';
      best = Math.max(best, minimax(board, false));
      board[i] = null;
    }
    return best;
  }
  let best = Infinity;
  for (const i of moves) {
    board[i] = 'X';
    best = Math.min(best, minimax(board, true));
    board[i] = null;
  }
  return best;
}

/**
 * Returns the AI ('O') move index for the given difficulty.
 * easy: random, medium: take win / block, else random, hard: minimax (unbeatable).
 */
export function tttAiMove(
  board: TttBoard,
  difficulty: Difficulty,
  random: () => number = Math.random,
): number {
  const moves = emptyIndices(board);
  if (moves.length === 0) {
    return -1;
  }

  if (difficulty === 'easy') {
    return moves[Math.floor(random() * moves.length)];
  }

  if (difficulty === 'medium') {
    // 1) win if possible
    for (const i of moves) {
      const copy = [...board];
      copy[i] = 'O';
      if (tttWinner(copy) === 'O') return i;
    }
    // 2) block X immediate win
    for (const i of moves) {
      const copy = [...board];
      copy[i] = 'X';
      if (tttWinner(copy) === 'X') return i;
    }
    // 3) center, else random
    if (board[4] === null) return 4;
    return moves[Math.floor(random() * moves.length)];
  }

  // hard — minimax
  let bestScore = -Infinity;
  let bestMove = moves[0];
  for (const i of moves) {
    const copy = [...board];
    copy[i] = 'O';
    const score = minimax(copy, false);
    if (score > bestScore) {
      bestScore = score;
      bestMove = i;
    }
  }
  return bestMove;
}

// ---------------------------------------------------------------------------
// 4×4 Sudoku
// ---------------------------------------------------------------------------

export type SudokuGrid = number[]; // length 16, 0 = empty, values 1..4

export interface SudokuPuzzle {
  puzzle: SudokuGrid;
  solution: SudokuGrid;
}

/** A few hand-checked 4×4 solutions (rows of 1..4, 2×2 boxes valid). */
const SUDOKU_SOLUTIONS: SudokuGrid[] = [
  [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1],
  [4, 3, 2, 1, 2, 1, 4, 3, 3, 4, 1, 2, 1, 2, 3, 4],
  [2, 4, 1, 3, 1, 3, 2, 4, 4, 2, 3, 1, 3, 1, 4, 2],
  [3, 1, 4, 2, 4, 2, 3, 1, 1, 3, 2, 4, 2, 4, 1, 3],
];

/** Number of clues kept by difficulty (out of 16). */
function clueCount(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 10;
  if (difficulty === 'medium') return 8;
  return 6;
}

export function makeSudokuPuzzle(
  difficulty: Difficulty,
  random: () => number = Math.random,
): SudokuPuzzle {
  const solution = SUDOKU_SOLUTIONS[Math.floor(random() * SUDOKU_SOLUTIONS.length)];
  const keep = clueCount(difficulty);
  const indices = Array.from({ length: 16 }, (_, i) => i);
  // Fisher–Yates with provided RNG.
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const keepSet = new Set(indices.slice(0, keep));
  const puzzle = solution.map((v, i) => (keepSet.has(i) ? v : 0));
  return { puzzle, solution };
}

export function isSudokuSolved(grid: SudokuGrid, solution: SudokuGrid): boolean {
  return grid.length === 16 && grid.every((v, i) => v === solution[i]);
}

/** Ratio of correctly filled (non-clue) cells, 0..1. */
export function sudokuCorrectRatio(
  grid: SudokuGrid,
  solution: SudokuGrid,
): number {
  let correct = 0;
  for (let i = 0; i < 16; i += 1) {
    if (grid[i] === solution[i]) correct += 1;
  }
  return correct / 16;
}

// ---------------------------------------------------------------------------
// N-back
// ---------------------------------------------------------------------------

export const NBACK_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export function makeNbackSequence(
  length: number,
  level: number,
  targetRatio = 0.3,
  random: () => number = Math.random,
): string[] {
  const seq: string[] = [];
  for (let i = 0; i < length; i += 1) {
    if (i >= level && random() < targetRatio) {
      seq.push(seq[i - level]); // force a match
    } else {
      seq.push(NBACK_LETTERS[Math.floor(random() * NBACK_LETTERS.length)]);
    }
  }
  return seq;
}

export function nbackIsMatch(seq: string[], index: number, level: number): boolean {
  return index >= level && seq[index] === seq[index - level];
}

/** Next N-back level: raise after ≥80% accuracy, drop below 50%, cap 1..3. */
export function nextNbackLevel(currentLevel: number, accuracy: number): number {
  if (accuracy >= 80) {
    return Math.min(3, currentLevel + 1);
  }
  if (accuracy < 50) {
    return Math.max(1, currentLevel - 1);
  }
  return currentLevel;
}

export interface NbackTally {
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
}

/** Accuracy 0..100 over all trials (hits + correct rejections) / total. */
export function nbackAccuracy(tally: NbackTally): number {
  const total =
    tally.hits + tally.misses + tally.falseAlarms + tally.correctRejections;
  if (total === 0) return 0;
  return Math.round(((tally.hits + tally.correctRejections) / total) * 100);
}

// ---------------------------------------------------------------------------
// Reaction time
// ---------------------------------------------------------------------------

export function reactionMaxDelayMs(difficulty: Difficulty): number {
  if (difficulty === 'easy') return 5000;
  if (difficulty === 'medium') return 4000;
  return 3000;
}

export function randomReactionDelayMs(
  difficulty: Difficulty,
  random: () => number = Math.random,
): number {
  const min = 1000;
  const max = reactionMaxDelayMs(difficulty);
  return Math.round(min + random() * (max - min));
}

export function averageReactionMs(samples: number[]): number {
  if (samples.length === 0) return 0;
  return Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
}

// ---------------------------------------------------------------------------
// Tower of Hanoi
// ---------------------------------------------------------------------------

export type HanoiPegs = [number[], number[], number[]]; // each peg bottom→top, larger first

export function initialHanoi(disks: number): HanoiPegs {
  const first: number[] = [];
  for (let d = disks; d >= 1; d -= 1) first.push(d);
  return [first, [], []];
}

export function hanoiCanMove(pegs: HanoiPegs, from: number, to: number): boolean {
  if (from === to) return false;
  const src = pegs[from];
  const dst = pegs[to];
  if (src.length === 0) return false;
  const moving = src[src.length - 1];
  const top = dst[dst.length - 1];
  return top === undefined || moving < top;
}

export function hanoiMove(pegs: HanoiPegs, from: number, to: number): HanoiPegs {
  if (!hanoiCanMove(pegs, from, to)) {
    return pegs;
  }
  const next: HanoiPegs = [[...pegs[0]], [...pegs[1]], [...pegs[2]]];
  const moving = next[from].pop()!;
  next[to].push(moving);
  return next;
}

export function hanoiSolved(pegs: HanoiPegs, disks: number): boolean {
  return pegs[2].length === disks;
}

export function hanoiMinMoves(disks: number): number {
  return 2 ** disks - 1;
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export const QUIZ_LETTERS = ['A', 'B', 'C', 'D'] as const;

export function indexToLetter(index: number): string {
  return QUIZ_LETTERS[index] ?? 'A';
}

export function quizSelectionsToLetters(selectedIndices: number[]): string[] {
  return selectedIndices.map(indexToLetter);
}
