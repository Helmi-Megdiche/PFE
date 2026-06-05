import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { tokenStorage } from '../auth/tokenStorage';
import { useChildId } from '../auth/useChildId';
import { useDevChildToken } from '../auth/useDevChildToken';
import { getApiBaseUrl } from '../config/apiConfig';
import { getChildPoints } from '../services/missionsApi';

export function ProfileScreen(): React.JSX.Element {
  const { childId, refresh: refreshChildId } = useChildId();
  const [points, setPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const devToken = useDevChildToken(getApiBaseUrl());

  const load = useCallback(async () => {
    if (!childId) {
      setLoading(false);
      return;
    }
    try {
      const res = await getChildPoints(childId);
      setPoints(res.totalPoints);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!childId) {
      return;
    }
    const id = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(id);
  }, [childId, load]);

  const onLogout = async () => {
    await tokenStorage.clearToken();
    refreshChildId();
    devToken.retry();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Child ID</Text>
      <Text style={styles.value}>{childId ?? '—'}</Text>
      <Text style={styles.label}>Total points</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={styles.points}>{points ?? 0}</Text>
          <Text style={styles.level}>
            Level {Math.floor((points ?? 0) / 500) + 1}
          </Text>
        </>
      )}
      <Text style={styles.hint}>
        Points refresh when you open this screen or the Missions tab (pull-to-refresh). Parent
        approval is not pushed in real time.
      </Text>
      <Pressable style={styles.btn} onPress={() => void load()}>
        <Text style={styles.btnText}>Refresh points</Text>
      </Pressable>
      {__DEV__ ? (
        <Pressable style={[styles.btn, styles.btnSecondary]} onPress={() => void onLogout()}>
          <Text style={styles.btnText}>Clear dev token</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#64748b', marginTop: 16 },
  value: { fontSize: 13, color: '#0f172a', fontFamily: 'monospace' },
  points: { fontSize: 32, fontWeight: '700', color: '#2563eb', marginTop: 4 },
  level: { fontSize: 18, fontWeight: '600', color: '#0f172a', marginTop: 8 },
  hint: { fontSize: 13, color: '#64748b', marginTop: 20, lineHeight: 20 },
  btn: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnSecondary: { backgroundColor: '#64748b', marginTop: 12 },
  btnText: { color: '#fff', fontWeight: '600' },
});
