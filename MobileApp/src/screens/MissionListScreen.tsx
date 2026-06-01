import React, { useCallback, useEffect, useState } from 'react';
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
import { getMissions, type MissionDto } from '../services/missionsApi';
import { navigateToMissionScreen } from '../navigation/navigationRef';

function missionType(m: MissionDto): string {
  return String(m.metadata?.type ?? 'real_world');
}

function MissionSection({
  title,
  missions,
  onOpen,
}: {
  title: string;
  missions: MissionDto[];
  onOpen: (m: MissionDto) => void;
}): React.JSX.Element | null {
  if (!missions.length) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {missions.map((m) => (
        <Pressable key={m.id} style={styles.card} onPress={() => onOpen(m)}>
          <Text style={styles.cardTitle}>{m.title}</Text>
          <Text style={styles.cardDesc}>{m.description}</Text>
          <Text style={styles.cardMeta}>
            {m.points} pts · {m.status} · {missionType(m)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MissionListScreen(): React.JSX.Element {
  const { childId, loading: childLoading } = useChildId();
  const [data, setData] = useState<Awaited<ReturnType<typeof getMissions>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!childId) {
      return;
    }
    try {
      const res = await getMissions(childId);
      setData(res);
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

  useEffect(() => {
    if (!childId) {
      return;
    }
    const id = setInterval(() => {
      void load();
    }, 60_000);
    return () => clearInterval(id);
  }, [childId, load]);

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const openMission = (m: MissionDto) => {
    if (m.status !== 'pending') {
      return;
    }
    const meta = (m.metadata ?? {}) as Record<string, unknown>;
    navigateToMissionScreen({
      missionId: m.id,
      title: m.title,
      description: m.description,
      points: m.points,
      missionType: missionType(m),
      metadata: meta,
    });
  };

  if (childLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!childId) {
    return (
      <View style={styles.centered}>
        <Text>No child profile — log in first.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <MissionSection title="Active" missions={data?.pending ?? []} onOpen={openMission} />
      <MissionSection
        title="Awaiting parent approval"
        missions={data?.pendingApproval ?? []}
        onOpen={() => undefined}
      />
      <MissionSection title="Completed" missions={data?.completed ?? []} onOpen={() => undefined} />
      <MissionSection title="Failed / escaped" missions={data?.failed ?? []} onOpen={() => undefined} />
      <MissionSection title="Expired" missions={data?.expired ?? []} onOpen={() => undefined} />
      {!data?.pending.length &&
      !data?.pendingApproval.length &&
      !data?.completed.length ? (
        <Text style={styles.empty}>No missions yet.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { padding: 16, paddingBottom: 0 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8, color: '#0f172a' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  cardDesc: { fontSize: 13, color: '#64748b', marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40 },
});
