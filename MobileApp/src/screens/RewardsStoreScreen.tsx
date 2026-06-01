import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useChildId } from '../auth/useChildId';
import { getChildPoints } from '../services/missionsApi';
import { claimReward, listRewards, type RewardDto } from '../services/rewardsApi';

export function RewardsStoreScreen(): React.JSX.Element {
  const { childId } = useChildId();
  const [rewards, setRewards] = useState<RewardDto[]>([]);
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const { rewards: list } = await listRewards();
      setRewards(list);
      if (childId) {
        const p = await getChildPoints(childId);
        setPoints(p.totalPoints);
      }
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onClaim = async (reward: RewardDto) => {
    try {
      const res = await claimReward(reward.id);
      setPoints(res.totalPoints);
      Alert.alert('Claimed', `You claimed "${reward.title}"`);
      void load();
    } catch (err) {
      Alert.alert('Claim failed', err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
      }>
      <Text style={styles.points}>Your points: {points}</Text>
      {rewards.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.title}>{r.title}</Text>
          <Text style={styles.desc}>{r.description}</Text>
          <Text style={styles.cost}>{r.pointsRequired} points</Text>
          <Pressable
            style={[styles.btn, points < r.pointsRequired && styles.btnDisabled]}
            disabled={points < r.pointsRequired}
            onPress={() => void onClaim(r)}>
            <Text style={styles.btnText}>Claim</Text>
          </Pressable>
        </View>
      ))}
      {!rewards.length ? <Text style={styles.empty}>No rewards available.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  points: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 16, fontWeight: '600' },
  desc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cost: { fontSize: 14, color: '#2563eb', marginTop: 8 },
  btn: {
    marginTop: 10,
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#94a3b8' },
  btnText: { color: '#fff', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 24 },
});
