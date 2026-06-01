import AsyncStorage from '@react-native-async-storage/async-storage';
import { resolveDifficulty, nextNbackLevel, type Difficulty } from './gameLogic';

export { nextNbackLevel };

/**
 * Local per-game performance store used for smart difficulty.
 * Server-side persistence (child_game_stats table) is future work; this keeps
 * difficulty adaptive on-device without a schema change.
 */

const KEY_PREFIX = '@pfe/gameStats/';

export type GameKey = 'tictactoe' | 'sudoku' | 'nback' | 'reaction' | 'hanoi';

export interface GameStat {
  lastScore: number; // 0..100 (or accuracy / ratio×100)
  lastLevel: number; // e.g. n-back level
  highScore: boolean; // last run was a strong success
  plays: number;
  updatedAt: string;
}

const DEFAULT_STAT: GameStat = {
  lastScore: 0,
  lastLevel: 2,
  highScore: false,
  plays: 0,
  updatedAt: '',
};

export async function getGameStat(game: GameKey): Promise<GameStat> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + game);
    if (!raw) return { ...DEFAULT_STAT };
    return { ...DEFAULT_STAT, ...(JSON.parse(raw) as Partial<GameStat>) };
  } catch {
    return { ...DEFAULT_STAT };
  }
}

export async function setGameStat(game: GameKey, stat: GameStat): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY_PREFIX + game, JSON.stringify(stat));
  } catch {
    // best effort
  }
}

export async function recordGameResult(
  game: GameKey,
  result: { score: number; level?: number; highScore: boolean },
): Promise<void> {
  const prev = await getGameStat(game);
  await setGameStat(game, {
    lastScore: result.score,
    lastLevel: result.level ?? prev.lastLevel,
    highScore: result.highScore,
    plays: prev.plays + 1,
    updatedAt: new Date().toISOString(),
  });
}

/** Difficulty for a game from age baseline + whether the last run was strong. */
export async function difficultyForGame(
  game: GameKey,
  age: number | null,
): Promise<Difficulty> {
  const stat = await getGameStat(game);
  return resolveDifficulty(age, stat.highScore);
}
