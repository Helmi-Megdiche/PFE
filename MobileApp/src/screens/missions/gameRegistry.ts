import type React from 'react';
import { TicTacToeGame } from './TicTacToeGame';
import { SudokuGame } from './SudokuGame';
import { NBackGame } from './NBackGame';
import { ReactionGame } from './ReactionGame';
import { TowerOfHanoiGame } from './TowerOfHanoiGame';
import { QuizScreen } from './QuizScreen';
import type { GameProps } from './gameTypes';

export type GameComponent = (props: GameProps) => React.JSX.Element;

/**
 * Resolve the playable component for a mission, or null for real-world missions
 * (which use a simple confirm button instead of a game).
 */
export function resolveGameComponent(
  missionType: string,
  metadata: Record<string, unknown>,
): GameComponent | null {
  if (missionType === 'quiz') {
    return QuizScreen;
  }
  if (missionType === 'minigame') {
    const game = String(metadata.game ?? '');
    if (game === 'sudoku') return SudokuGame;
    return TicTacToeGame;
  }
  if (missionType === 'cognitive') {
    const exercise = String(metadata.exercise ?? 'nback');
    if (exercise === 'reaction') return ReactionGame;
    if (exercise === 'hanoi') return TowerOfHanoiGame;
    return NBackGame;
  }
  return null; // real_world
}
