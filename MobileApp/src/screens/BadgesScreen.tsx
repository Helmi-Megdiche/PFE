import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useChildId } from '../auth/useChildId';
import { listBadges, type BadgeDto } from '../services/badgesApi';

export function BadgesScreen(): React.JSX.Element {
  const { childId } = useChildId();
  const [badges, setBadges] = useState<BadgeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!childId) {
      return;
    }
    try {
      const res = await listBadges(childId);
      setBadges(res.badges);
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
      <View style={styles.grid}>
        {badges.map((b) => (
          <View
            key={b.id}
            style={[styles.badge, b.earned ? styles.badgeEarned : styles.badgeLocked]}>
            <Text style={styles.icon}>{b.icon ?? '🏅'}</Text>
            <Text style={styles.name}>{b.name}</Text>
            <Text style={styles.desc} numberOfLines={2}>
              {b.description}
            </Text>
            <Text style={styles.status}>{b.earned ? 'Earned' : 'Locked'}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  badge: {
    width: '47%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  badgeEarned: { borderColor: '#22c55e' },
  badgeLocked: { opacity: 0.65 },
  icon: { fontSize: 28, textAlign: 'center' },
  name: { fontSize: 14, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  desc: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' },
  status: { fontSize: 11, marginTop: 6, textAlign: 'center', color: '#2563eb' },
});
