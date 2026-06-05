import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { BadgeDto } from '../services/badgesApi';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type BadgeGuideStats,
  filterGuideBadges,
  groupBadgesByCategory,
  markNextBadges,
} from '../utils/badgeGuide';

interface BadgeRanksModalProps {
  visible: boolean;
  onClose: () => void;
  badges: BadgeDto[];
  stats: BadgeGuideStats;
}

export function BadgeRanksModal({
  visible,
  onClose,
  badges,
  stats,
}: BadgeRanksModalProps): React.JSX.Element {
  const guideBadges = filterGuideBadges(badges);
  const progressMap = markNextBadges(guideBadges, stats);
  const groups = groupBadgesByCategory(guideBadges);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <View style={styles.header}>
            <Text style={styles.title}>Badge ranks & progress</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.close}>Close</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.summary}>
              <Text style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Points: </Text>
                {stats.totalPoints}
              </Text>
              <Text style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Missions done: </Text>
                {stats.completedMissions}
              </Text>
              {stats.age != null ? (
                <Text style={styles.summaryItem}>
                  <Text style={styles.summaryLabel}>Age: </Text>
                  {stats.age}
                </Text>
              ) : null}
            </View>

            {CATEGORY_ORDER.map((category) => {
              const list = groups.get(category) ?? [];
              if (!list.length) return null;
              return (
                <View key={category} style={styles.section}>
                  <Text style={styles.sectionTitle}>{CATEGORY_LABELS[category]}</Text>
                  {list.map((badge) => {
                    const progress = progressMap.get(badge.id)!;
                    return (
                      <View
                        key={badge.id}
                        style={[
                          styles.row,
                          badge.earned && styles.rowEarned,
                          progress.isNext && styles.rowNext,
                        ]}>
                        <View style={styles.rowTop}>
                          <Text style={styles.icon}>{badge.icon ?? '🏅'}</Text>
                          <View style={styles.rowText}>
                            <Text style={styles.badgeName}>
                              {badge.name}
                              {progress.isNext ? ' · Next up' : ''}
                            </Text>
                            <Text style={styles.badgeDesc}>{badge.description}</Text>
                            {badge.pointsAwarded != null ? (
                              <Text style={styles.reward}>+{badge.pointsAwarded} bonus points</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.status, badge.earned && styles.statusEarned]}>
                            {badge.earned ? 'Earned' : 'Locked'}
                          </Text>
                        </View>
                        {!badge.earned && progress.pct > 0 ? (
                          <View style={styles.barTrack}>
                            <View style={[styles.barFill, { width: `${progress.pct}%` }]} />
                          </View>
                        ) : null}
                        <Text style={styles.progressLabel}>{progress.label}</Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  close: { fontSize: 15, color: '#2563eb', fontWeight: '600' },
  body: { flexGrow: 0 },
  bodyContent: { padding: 16, paddingBottom: 28 },
  summary: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    gap: 4,
  },
  summaryItem: { fontSize: 14, color: '#334155' },
  summaryLabel: { fontWeight: '600', color: '#64748b' },
  section: { marginBottom: 18 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  row: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  rowEarned: { borderColor: '#86efac', backgroundColor: '#f0fdf4' },
  rowNext: { borderColor: '#93c5fd', backgroundColor: '#eff6ff' },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  icon: { fontSize: 24 },
  rowText: { flex: 1 },
  badgeName: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  badgeDesc: { fontSize: 12, color: '#64748b', marginTop: 2 },
  reward: { fontSize: 11, color: '#2563eb', marginTop: 4 },
  status: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  statusEarned: { color: '#16a34a' },
  barTrack: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    marginTop: 10,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  progressLabel: { fontSize: 11, color: '#475569', marginTop: 6 },
});
