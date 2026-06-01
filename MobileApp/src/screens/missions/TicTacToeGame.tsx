import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  tttAiMove,
  tttWinner,
  type Difficulty,
  type TttBoard,
} from '../../missions/games/gameLogic';
import { difficultyForGame, recordGameResult } from '../../missions/games/gameStats';
import type { GameProps } from './gameTypes';

const EMPTY: TttBoard = [null, null, null, null, null, null, null, null, null];

export function TicTacToeGame({ metadata, age, onComplete }: GameProps): React.JSX.Element {
  const [board, setBoard] = useState<TttBoard>([...EMPTY]);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    (metadata.aiDifficulty as Difficulty) ?? 'medium',
  );
  const [status, setStatus] = useState('Your turn (X)');
  const doneRef = useRef(false);

  useEffect(() => {
    if (metadata.aiDifficulty) {
      return;
    }
    void difficultyForGame('tictactoe', age).then(setDifficulty);
  }, [age, metadata.aiDifficulty]);

  const winner = useMemo(() => tttWinner(board), [board]);

  useEffect(() => {
    if (doneRef.current || winner === null) {
      return;
    }
    doneRef.current = true;
    const childWon = winner === 'X';
    const draw = winner === 'draw';
    setStatus(childWon ? 'You win! 🎉' : draw ? "It's a draw" : 'AI wins');
    void recordGameResult('tictactoe', {
      score: childWon ? 100 : draw ? 50 : 0,
      highScore: childWon,
    });
    onComplete({ won: childWon, completed: true });
  }, [winner, onComplete]);

  const playerMove = (index: number) => {
    if (board[index] !== null || winner !== null) {
      return;
    }
    const afterPlayer = [...board];
    afterPlayer[index] = 'X';
    if (tttWinner(afterPlayer) !== null) {
      setBoard(afterPlayer);
      return;
    }
    const aiIndex = tttAiMove(afterPlayer, difficulty);
    if (aiIndex >= 0) {
      afterPlayer[aiIndex] = 'O';
    }
    setBoard(afterPlayer);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Tic-Tac-Toe</Text>
      <Text style={styles.sub}>Difficulty: {difficulty}</Text>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.grid}>
        {board.map((cell, i) => (
          <Pressable key={i} style={styles.cell} onPress={() => playerMove(i)}>
            <Text style={[styles.mark, cell === 'O' && styles.markO]}>{cell ?? ''}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#94a3b8', marginTop: 4 },
  status: { color: '#fbbf24', fontSize: 16, marginTop: 12, fontWeight: '600' },
  grid: {
    marginTop: 20,
    width: 300,
    height: 300,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: 100,
    height: 100,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { color: '#60a5fa', fontSize: 48, fontWeight: '800' },
  markO: { color: '#f87171' },
});
