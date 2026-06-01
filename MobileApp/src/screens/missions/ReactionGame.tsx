import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  averageReactionMs,
  randomReactionDelayMs,
  type Difficulty,
} from '../../missions/games/gameLogic';
import { difficultyForGame, recordGameResult } from '../../missions/games/gameStats';
import type { GameProps } from './gameTypes';

const ATTEMPTS = 3;
type Phase = 'idle' | 'waiting' | 'go' | 'tooSoon' | 'done';

export function ReactionGame({ age, onComplete }: GameProps): React.JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [phase, setPhase] = useState<Phase>('idle');
  const [samples, setSamples] = useState<number[]>([]);
  const [lastMs, setLastMs] = useState<number | null>(null);
  const goAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void difficultyForGame('reaction', age).then(setDifficulty);
  }, [age]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const startAttempt = () => {
    setPhase('waiting');
    const delay = randomReactionDelayMs(difficulty);
    timerRef.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setPhase('go');
    }, delay);
  };

  const finish = (allSamples: number[]) => {
    const avg = averageReactionMs(allSamples);
    void recordGameResult('reaction', { score: avg, highScore: avg <= 300 });
    setPhase('done');
    onComplete({ reactionTimeMs: avg });
  };

  const onTap = () => {
    if (phase === 'idle') {
      startAttempt();
      return;
    }
    if (phase === 'waiting') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setPhase('tooSoon');
      return;
    }
    if (phase === 'tooSoon') {
      startAttempt();
      return;
    }
    if (phase === 'go') {
      const ms = Date.now() - goAtRef.current;
      setLastMs(ms);
      const next = [...samples, ms];
      setSamples(next);
      if (next.length >= ATTEMPTS) {
        finish(next);
      } else {
        startAttempt();
      }
      return;
    }
  };

  const bg =
    phase === 'go' ? '#16a34a' : phase === 'tooSoon' ? '#b91c1c' : '#1e293b';
  const label =
    phase === 'idle'
      ? 'Tap to start'
      : phase === 'waiting'
      ? 'Wait for green…'
      : phase === 'go'
      ? 'TAP NOW!'
      : phase === 'tooSoon'
      ? 'Too soon! Tap to retry'
      : 'Done!';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Reaction Time</Text>
      <Text style={styles.sub}>
        Attempt {Math.min(samples.length + (phase === 'done' ? 0 : 1), ATTEMPTS)} / {ATTEMPTS} ·{' '}
        {difficulty}
      </Text>
      <Pressable style={[styles.stage, { backgroundColor: bg }]} onPress={onTap}>
        <Text style={styles.stageText}>{label}</Text>
        {lastMs != null && phase !== 'tooSoon' ? (
          <Text style={styles.ms}>{lastMs} ms</Text>
        ) : null}
      </Pressable>
      {samples.length > 0 ? (
        <Text style={styles.avg}>Average: {averageReactionMs(samples)} ms</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#94a3b8', marginTop: 6 },
  stage: {
    marginTop: 24,
    width: 280,
    height: 280,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  ms: { color: '#e2e8f0', marginTop: 8, fontSize: 16 },
  avg: { color: '#cbd5e1', marginTop: 18 },
});
