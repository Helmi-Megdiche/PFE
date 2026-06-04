import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { ApiHttpError } from '../services/apiClient';
import {
  abandonMission,
  completeMission,
  type MissionCompletionPayload,
} from '../services/missionsApi';
import { resolveGameComponent } from './missions/gameRegistry';
import {
  beginMissionCaptureSession,
  forceEndMissionCaptureSession,
  isMissionCapturePaused,
} from '../utils/missionCaptureSession';

type Props = NativeStackScreenProps<RootStackParamList, 'MissionScreen'>;

export function MissionScreen({ navigation, route }: Props): React.JSX.Element {
  const { missionId, title, description, points, missionType, metadata } = route.params;
  const settledRef = useRef(false); // completed OR abandoned — no further actions
  const [submitting, setSubmitting] = useState(false);

  const GameComponent = resolveGameComponent(missionType, metadata);

  useEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  useEffect(() => {
    if (!isMissionCapturePaused()) {
      beginMissionCaptureSession();
    }
    return () => {
      forceEndMissionCaptureSession();
    };
  }, []);

  // Disable hardware back; child must finish or explicitly quit.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const handleAbandon = useCallback(async () => {
    if (settledRef.current) {
      return;
    }
    settledRef.current = true;
    try {
      const res = await abandonMission(missionId);
      Alert.alert('Mission escaped', `Penalty: -${res.penalty} points. Total: ${res.totalPoints}`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      forceEndMissionCaptureSession();
      navigation.goBack();
    }
  }, [missionId, navigation]);

  // Escape penalty only when the app leaves the foreground (not brief "inactive" on Android).
  useEffect(() => {
    const appStateRef = { current: AppState.currentState };
    const mountedAt = Date.now();
    const sub = AppState.addEventListener('change', (next) => {
      const leftForeground =
        appStateRef.current === 'active' && next === 'background';
      const graceMs = 3_000;
      if (leftForeground && Date.now() - mountedAt > graceMs && !settledRef.current) {
        void handleAbandon();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [handleAbandon]);

  const confirmQuit = () => {
    Alert.alert(
      'Leave mission?',
      'If you leave now, you will lose 10 points.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave (-10)', style: 'destructive', onPress: () => void handleAbandon() },
      ],
    );
  };

  const submitCompletion = useCallback(
    async (payload: MissionCompletionPayload) => {
      if (settledRef.current || submitting) {
        return;
      }
      setSubmitting(true);
      try {
        const res = await completeMission(missionId, payload);
        settledRef.current = true;
        const awarded = res.points ?? res.pointsAwarded ?? 0;
        const message =
          res.status === 'pending_approval'
            ? res.message ?? 'Waiting for parent approval'
            : `+${awarded} points! Total: ${res.totalPoints}`;
        Alert.alert('Mission', message, [
          {
            text: 'OK',
            onPress: () => {
              forceEndMissionCaptureSession();
              navigation.goBack();
            },
          },
        ]);
      } catch (err) {
        setSubmitting(false);
        if (err instanceof ApiHttpError && err.status === 409) {
          settledRef.current = true;
          Alert.alert(
            'Mission already finished',
            'This mission was already completed. You can close this screen.',
            [
              {
                text: 'OK',
                onPress: () => {
                  endMissionCaptureSession();
                  navigation.goBack();
                },
              },
            ],
          );
          return;
        }
        Alert.alert('Error', err instanceof Error ? err.message : String(err));
      }
    },
    [missionId, navigation, submitting],
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={false}
        bounces={false}>
        <View style={styles.header}>
          <Text style={styles.badge}>ACTIVE MISSION</Text>
          <Pressable onPress={confirmQuit} hitSlop={12}>
            <Text style={styles.quit}>Quit</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
        <Text style={styles.meta}>
          {points} points · {missionType}
        </Text>

        <View style={styles.gameArea}>
          {GameComponent ? (
            <GameComponent
              metadata={metadata}
              points={points}
              age={null}
              onComplete={(payload) => void submitCompletion(payload)}
              onQuit={confirmQuit}
            />
          ) : (
            <Pressable
              style={styles.primaryBtn}
              disabled={submitting}
              onPress={() => void submitCompletion({ confirmed: true })}>
              <Text style={styles.primaryBtnText}>Mark as done</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.warning}>
          Leaving the app or quitting applies a -10 point escape penalty.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 44, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  badge: { color: '#fbbf24', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  quit: { color: '#f87171', fontWeight: '700' },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 8 },
  desc: { color: '#cbd5e1', fontSize: 15, marginTop: 8, lineHeight: 22 },
  meta: { color: '#94a3b8', marginTop: 12 },
  gameArea: { marginTop: 24, alignItems: 'center' },
  warning: { color: '#f87171', fontSize: 13, marginTop: 28, lineHeight: 20, textAlign: 'center' },
  primaryBtn: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
