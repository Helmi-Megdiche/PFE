import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  makeNbackSequence,
  nbackAccuracy,
  nbackIsMatch,
  type NbackTally,
} from '../../missions/games/gameLogic';
import { nextNbackLevel, recordGameResult } from '../../missions/games/gameStats';
import type { GameProps } from './gameTypes';

const TRIALS = 20;
const STEP_MS = 1800;

export function NBackGame({ metadata, onComplete }: GameProps): React.JSX.Element {
  const level = Math.max(1, Math.min(3, Number(metadata.level ?? 2)));
  const [sequence] = useState<string[]>(() => makeNbackSequence(TRIALS, level));
  const [index, setIndex] = useState(-1);
  const [finished, setFinished] = useState(false);
  const tallyRef = useRef<NbackTally>({
    hits: 0,
    misses: 0,
    falseAlarms: 0,
    correctRejections: 0,
  });
  const respondedRef = useRef(false);

  useEffect(() => {
    if (finished) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((prev) => {
        // Grade the trial we are leaving before advancing.
        if (prev >= 0) {
          const wasMatch = nbackIsMatch(sequence, prev, level);
          const t = tallyRef.current;
          if (wasMatch && !respondedRef.current) t.misses += 1;
          if (!wasMatch && !respondedRef.current) t.correctRejections += 1;
        }
        respondedRef.current = false;
        const next = prev + 1;
        if (next >= sequence.length) {
          clearInterval(timer);
          setFinished(true);
          return prev;
        }
        return next;
      });
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [finished, level, sequence]);

  useEffect(() => {
    if (!finished) {
      return;
    }
    const accuracy = nbackAccuracy(tallyRef.current);
    void recordGameResult('nback', {
      score: accuracy,
      level: nextNbackLevel(level, accuracy),
      highScore: accuracy >= 80,
    });
    onComplete({ exerciseScore: accuracy });
  }, [finished, level, onComplete]);

  const onTapMatch = () => {
    if (index < 0 || respondedRef.current) {
      return;
    }
    respondedRef.current = true;
    const t = tallyRef.current;
    if (nbackIsMatch(sequence, index, level)) {
      t.hits += 1;
    } else {
      t.falseAlarms += 1;
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>N-back (level {level})</Text>
      <Text style={styles.sub}>
        Tap “Match” when the letter is the same as {level} step{level > 1 ? 's' : ''} ago.
      </Text>
      <View style={styles.stage}>
        <Text style={styles.letter}>{index >= 0 && !finished ? sequence[index] : '•'}</Text>
      </View>
      <Text style={styles.progress}>
        {finished ? 'Done!' : `Trial ${Math.max(0, index + 1)} / ${sequence.length}`}
      </Text>
      <Pressable style={[styles.matchBtn, finished && styles.btnDisabled]} disabled={finished} onPress={onTapMatch}>
        <Text style={styles.matchText}>Match</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  title: { color: '#fff', fontSize: 22, fontWeight: '700' },
  sub: { color: '#94a3b8', marginTop: 6, textAlign: 'center', paddingHorizontal: 16 },
  stage: {
    marginTop: 28,
    width: 160,
    height: 160,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: { color: '#60a5fa', fontSize: 80, fontWeight: '800' },
  progress: { color: '#cbd5e1', marginTop: 18 },
  matchBtn: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 10,
  },
  btnDisabled: { backgroundColor: '#475569' },
  matchText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
