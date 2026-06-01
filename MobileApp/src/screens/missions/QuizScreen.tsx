import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { quizSelectionsToLetters } from '../../missions/games/gameLogic';
import { resolveQuizQuestions } from '../../missions/games/quizBank';
import type { GameProps } from './gameTypes';

export function QuizScreen({ metadata, onComplete }: GameProps): React.JSX.Element {
  const questions = useMemo(() => resolveQuizQuestions(metadata), [metadata]);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const question = questions[current];

  const choose = (optionIndex: number) => {
    const next = [...answers, optionIndex];
    setAnswers(next);
    if (current + 1 >= questions.length) {
      onComplete({ answers: quizSelectionsToLetters(next) });
    } else {
      setCurrent((c) => c + 1);
    }
  };

  if (!question) {
    return <Text style={styles.sub}>No questions available.</Text>;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.progress}>
        Question {current + 1} / {questions.length}
      </Text>
      <Text style={styles.question}>{question.text}</Text>
      <View style={styles.options}>
        {question.options.map((opt, i) => (
          <Pressable key={i} style={styles.option} onPress={() => choose(i)}>
            <Text style={styles.optionLetter}>{String.fromCharCode(65 + i)}</Text>
            <Text style={styles.optionText}>{opt}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  progress: { color: '#94a3b8', textAlign: 'center' },
  sub: { color: '#cbd5e1', textAlign: 'center' },
  question: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  options: { marginTop: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },
  optionLetter: {
    color: '#60a5fa',
    fontSize: 18,
    fontWeight: '800',
    width: 28,
  },
  optionText: { color: '#e2e8f0', fontSize: 16, flex: 1 },
});
