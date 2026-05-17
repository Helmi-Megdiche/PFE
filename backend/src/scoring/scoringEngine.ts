/**
 * Pure scoring functions — addiction risk (higher = worse) and well-being (higher = better).
 */

export interface DailyUsageStats {
  totalScreenMinutes: number;
  sessionCount: number;
  nightMinutes: number;
  weekOverWeekChangePercent: number;
  physicalActivityMinutes: number;
}

export interface AddictionScoreComponents {
  intensity: number;
  compulsivity: number;
  nightUsage: number;
  escalation: number;
  realImbalance: number;
}

export interface WellbeingComponents {
  screenBalance: number;
  contentQuality: number;
  realActivity: number;
  sleepConsistency: number;
  familyInteraction: number;
}

export type WellbeingStats = DailyUsageStats & {
  educationalScreenMinutes: number;
  bedtimeVarianceMinutes: number;
  familyCallsMessages: number;
  /** Recommended daily screen cap in minutes (age-based). Default 180 (3h). */
  recommendedScreenMinutes?: number;
};

export function computeAddictionScore(stats: DailyUsageStats): {
  score: number;
  components: AddictionScoreComponents;
} {
  const total = stats.totalScreenMinutes;

  const intensity = Math.min(total / 480, 1) * 100;

  const sessionsPerHour = stats.sessionCount / 16;
  const compulsivity = Math.min((sessionsPerHour / 6) * 100, 100);

  const nightUsage =
    total > 0 ? Math.min(100, (stats.nightMinutes / total) * 100) : 0;

  let escalation = 0;
  if (stats.weekOverWeekChangePercent > 20) {
    escalation = 100;
  } else if (stats.weekOverWeekChangePercent > 0) {
    escalation = (stats.weekOverWeekChangePercent / 20) * 100;
  }

  let realImbalance = 0;
  if (total > 0) {
    const idealActivity = total / 10;
    if (stats.physicalActivityMinutes < idealActivity) {
      realImbalance = Math.min(
        100,
        (1 - stats.physicalActivityMinutes / idealActivity) * 100,
      );
    }
  }

  const weighted = {
    intensity: intensity * 0.3,
    compulsivity: compulsivity * 0.2,
    nightUsage: nightUsage * 0.25,
    escalation: escalation * 0.15,
    realImbalance: realImbalance * 0.1,
  };

  const score = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        weighted.intensity +
          weighted.compulsivity +
          weighted.nightUsage +
          weighted.escalation +
          weighted.realImbalance,
      ),
    ),
  );

  return {
    score,
    components: {
      intensity: Math.round(intensity),
      compulsivity: Math.round(compulsivity),
      nightUsage: Math.round(nightUsage),
      escalation: Math.round(escalation),
      realImbalance: Math.round(realImbalance),
    },
  };
}

export function computeWellbeingScore(stats: WellbeingStats): {
  score: number;
  components: WellbeingComponents;
} {
  const total = stats.totalScreenMinutes;
  const recommendedMinutes = stats.recommendedScreenMinutes ?? 180;

  let screenBalance = 100;
  if (total > recommendedMinutes) {
    const excess = total - recommendedMinutes;
    screenBalance = Math.max(0, 100 - (excess / 240) * 100);
  }

  const contentQuality =
    total > 0
      ? Math.min(100, (stats.educationalScreenMinutes / total) * 100)
      : 0;

  const realActivity = Math.min(
    100,
    (stats.physicalActivityMinutes / 60) * 100,
  );

  let sleepConsistency = 100;
  const variance = stats.bedtimeVarianceMinutes;
  if (variance > 120) {
    sleepConsistency = 0;
  } else if (variance > 30) {
    sleepConsistency = Math.max(0, 100 - ((variance - 30) / 90) * 100);
  }

  const familyInteraction = Math.min(100, stats.familyCallsMessages * 10);

  const weighted = {
    screenBalance: screenBalance * 0.3,
    contentQuality: contentQuality * 0.25,
    realActivity: realActivity * 0.2,
    sleepConsistency: sleepConsistency * 0.15,
    familyInteraction: familyInteraction * 0.1,
  };

  const score = Math.round(
    Math.min(
      100,
      Math.max(
        0,
        weighted.screenBalance +
          weighted.contentQuality +
          weighted.realActivity +
          weighted.sleepConsistency +
          weighted.familyInteraction,
      ),
    ),
  );

  return {
    score,
    components: {
      screenBalance: Math.round(screenBalance),
      contentQuality: Math.round(contentQuality),
      realActivity: Math.round(realActivity),
      sleepConsistency: Math.round(sleepConsistency),
      familyInteraction: Math.round(familyInteraction),
    },
  };
}
