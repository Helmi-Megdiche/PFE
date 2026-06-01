import React, { useCallback, useEffect, useRef } from 'react';
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
import { executeMissionAction } from '../missions/missionCompletion';

type Props = NativeStackScreenProps<RootStackParamList, 'MissionScreen'>;

export function MissionScreen({ navigation, route }: Props): React.JSX.Element {
  const { missionId, title, description, points, missionType, metadata } = route.params;
  const abandonedRef = useRef(false);

  useEffect(() => {
    navigation.getParent()?.setOptions({ tabBarStyle: { display: 'none' } });
    return () => {
      navigation.getParent()?.setOptions({ tabBarStyle: undefined });
    };
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const handleAbandon = useCallback(async () => {
    if (abandonedRef.current) {
      return;
    }
    abandonedRef.current = true;
    try {
      const res = await executeMissionAction(missionId, missionType, metadata, 'abandon');
      Alert.alert('Mission escaped', res.message);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      navigation.goBack();
    }
  }, [missionId, missionType, metadata, navigation]);

  useEffect(() => {
    // Escape penalty when leaving app (Home / app switch).
    // Known limitation: force-quit does not fire background — no penalty applied.
    // Future: server-side inactivity timeout → auto-fail with penalty.
    const appStateRef = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', (next) => {
      if (
        appStateRef.current === 'active' &&
        (next === 'background' || next === 'inactive')
      ) {
        void handleAbandon();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [handleAbandon]);

  const finishAndExit = (message: string) => {
    Alert.alert('Mission', message, [{ text: 'OK', onPress: () => navigation.goBack() }]);
  };

  const onMissionComplete = async () => {
    try {
      const res = await executeMissionAction(missionId, missionType, metadata, 'complete');
      finishAndExit(res.message);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    }
  };

  const renderActions = () => {
    switch (missionType) {
      case 'real_world':
        return (
          <Pressable style={styles.primaryBtn} onPress={() => void onMissionComplete()}>
            <Text style={styles.primaryBtnText}>Mark as done</Text>
          </Pressable>
        );
      case 'quiz':
        return (
          <Pressable style={styles.primaryBtn} onPress={() => void onMissionComplete()}>
            <Text style={styles.primaryBtnText}>Complete quiz (demo)</Text>
          </Pressable>
        );
      case 'cognitive':
        return (
          <Pressable style={styles.primaryBtn} onPress={() => void onMissionComplete()}>
            <Text style={styles.primaryBtnText}>I did it (demo)</Text>
          </Pressable>
        );
      case 'minigame':
        return (
          <Pressable style={styles.primaryBtn} onPress={() => void onMissionComplete()}>
            <Text style={styles.primaryBtnText}>Mark as won</Text>
          </Pressable>
        );
      default:
        return (
          <Pressable style={styles.primaryBtn} onPress={() => void onMissionComplete()}>
            <Text style={styles.primaryBtnText}>Complete</Text>
          </Pressable>
        );
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.badge}>Active mission</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.desc}>{description}</Text>
        <Text style={styles.meta}>
          {points} points · {missionType}
        </Text>
        <Text style={styles.warning}>
          Back is disabled. Leaving the app (Home) applies a -10 point escape penalty.
        </Text>
        {renderActions()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 24, paddingTop: 48 },
  badge: { color: '#fbbf24', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 8 },
  desc: { color: '#cbd5e1', fontSize: 16, marginTop: 12, lineHeight: 24 },
  meta: { color: '#94a3b8', marginTop: 16 },
  warning: { color: '#f87171', fontSize: 13, marginTop: 20, lineHeight: 20 },
  primaryBtn: {
    marginTop: 32,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
