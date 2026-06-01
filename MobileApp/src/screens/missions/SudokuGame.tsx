import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  isSudokuSolved,
  makeSudokuPuzzle,
  sudokuCorrectRatio,
  type Difficulty,
  type SudokuPuzzle,
} from '../../missions/games/gameLogic';
import { difficultyForGame, recordGameResult } from '../../missions/games/gameStats';
import type { GameProps } from './gameTypes';

export function SudokuGame({ metadata, age, onComplete }: GameProps): React.JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (metadata.sudokuDifficulty as Difficulty) ?? 'easy',
  );
  const [ready, setReady] = useState(false);
  const [puzzle, setPuzzle] = useState<SudokuPuzzle | null>(null);
  const [grid, setGrid] = useState<number[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    void (async () => {
      const diff = metadata.sudokuDifficulty
        ? (metadata.sudokuDifficulty as Difficulty)
        : await difficultyForGame('sudoku', age);
      setDifficulty(diff);
      const p = makeSudokuPuzzle(diff);
      setPuzzle(p);
      setGrid([...p.puzzle]);
      setReady(true);
    })();
  }, [age, metadata.sudokuDifficulty]);

  const clues = useMemo(
    () => new Set(puzzle ? puzzle.puzzle.map((v, i) => (v !== 0 ? i : -1)) : []),
    [puzzle],
  );

  const place = (value: number) => {
    if (selected == null || clues.has(selected) || solved || !puzzle) {
      return;
    }
    const next = [...grid];
    next[selected] = value;
    setGrid(next);
    if (isSudokuSolved(next, puzzle.solution)) {
      setSolved(true);
      void recordGameResult('sudoku', { score: 100, highScore: true });
      onComplete({ won: true, completed: true });
    }
  };

  const clearCell = () => {
    if (selected == null || clues.has(selected) || solved) {
      return;
    }
    const next = [...grid];
    next[selected] = 0;
    setGrid(next);
  };

  const giveUp = () => {
    if (!puzzle || solved) {
      return;
    }
    const ratio = sudokuCorrectRatio(grid, puzzle.solution);
    setSolved(true);
    void recordGameResult('sudoku', { score: Math.round(ratio * 100), highScore: ratio >= 0.9 });
    onComplete({ won: ratio >= 0.75, completed: true });
  };

  if (!ready) {
    return <Text style={styles.status}>Loading puzzle…</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Mini Sudoku (4×4)</Text>
      <Text style={styles.sub}>Each row, column and 2×2 box uses 1–4. Difficulty: {difficulty}</Text>
      <View style={styles.grid}>
        {grid.map((v, i) => {
          const isClue = clues.has(i);
          const isSel = selected === i;
          return (
            <Pressable
              key={i}
              style={[
                styles.cell,
                (i % 4) % 2 === 0 ? styles.cellLight : null,
                isSel && styles.cellSelected,
                isClue && styles.cellClue,
              ]}
              onPress={() => !isClue && setSelected(i)}>
              <Text style={[styles.value, isClue && styles.valueClue]}>{v !== 0 ? v : ''}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.pad}>
        {[1, 2, 3, 4].map((n) => (
          <Pressable key={n} style={styles.numBtn} onPress={() => place(n)}>
            <Text style={styles.numText}>{n}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.numBtn, styles.clearBtn]} onPress={clearCell}>
          <Text style={styles.numText}>⌫</Text>
        </Pressable>
      </View>
      {solved ? (
        <Text style={styles.solved}>Solved! 🎉</Text>
      ) : (
        <Pressable style={styles.giveUp} onPress={giveUp}>
          <Text style={styles.giveUpText}>Submit / Give up</Text>
        </Pressable>
      )}
    </View>
  );
}

const CELL = 64;
const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#94a3b8', marginTop: 6, textAlign: 'center', paddingHorizontal: 12 },
  status: { color: '#cbd5e1', marginTop: 20, textAlign: 'center' },
  grid: { marginTop: 18, width: CELL * 4, height: CELL * 4, flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: CELL,
    height: CELL,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
  },
  cellLight: { backgroundColor: '#243042' },
  cellSelected: { borderColor: '#60a5fa', borderWidth: 2 },
  cellClue: { backgroundColor: '#0f172a' },
  value: { color: '#e2e8f0', fontSize: 26, fontWeight: '700' },
  valueClue: { color: '#64748b' },
  pad: { flexDirection: 'row', marginTop: 18 },
  numBtn: {
    width: 52,
    height: 52,
    backgroundColor: '#2563eb',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  clearBtn: { backgroundColor: '#64748b' },
  numText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  solved: { color: '#34d399', fontSize: 18, fontWeight: '700', marginTop: 18 },
  giveUp: { marginTop: 18 },
  giveUpText: { color: '#94a3b8', textDecorationLine: 'underline' },
});
