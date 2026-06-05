import type { BadgeDto } from '../services/badgesApi';

export const LEGACY_BADGE_NAMES = new Set(['First Mission', 'Mission Master']);

export const CATEGORY_LABELS: Record<string, string> = {
  point: 'Points ranks',
  mission: 'Mission ranks',
  age: 'Age badges',
  special: 'Special achievements',
};

export const CATEGORY_ORDER = ['point', 'mission', 'age', 'special'] as const;

export interface BadgeGuideStats {
  totalPoints: number;
  completedMissions: number;
  age: number | null;
}

export interface BadgeProgress {
  label: string;
  pct: number;
  isNext: boolean;
}

export function filterGuideBadges(badges: BadgeDto[]): BadgeDto[] {
  return badges.filter((b) => !LEGACY_BADGE_NAMES.has(b.name));
}

export function sortBadgesForGuide(a: BadgeDto, b: BadgeDto): number {
  const av = a.requirementValue ?? Number.MAX_SAFE_INTEGER;
  const bv = b.requirementValue ?? Number.MAX_SAFE_INTEGER;
  if (av !== bv) return av - bv;
  return a.name.localeCompare(b.name);
}

function ageMatchesRange(age: number | null, config: Record<string, unknown> | null | undefined): boolean {
  if (age == null || !config) return false;
  const min = typeof config.min === 'number' ? config.min : 0;
  const max = typeof config.max === 'number' ? config.max : 999;
  return age >= min && age <= max;
}

export function computeBadgeProgress(badge: BadgeDto, stats: BadgeGuideStats): BadgeProgress {
  if (badge.earned) {
    return { label: 'Earned', pct: 100, isNext: false };
  }

  switch (badge.requirementType) {
    case 'total_points': {
      const target = badge.requirementValue ?? 0;
      const current = stats.totalPoints;
      const remaining = Math.max(0, target - current);
      return {
        label:
          remaining === 0
            ? `${current} / ${target} points — ready!`
            : `${current} / ${target} points (${remaining} more)`,
        pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
        isNext: false,
      };
    }
    case 'missions_completed': {
      const target = badge.requirementValue ?? 0;
      const current = stats.completedMissions;
      const remaining = Math.max(0, target - current);
      return {
        label:
          remaining === 0
            ? `${current} / ${target} missions — ready!`
            : `${current} / ${target} missions (${remaining} more)`,
        pct: target > 0 ? Math.min(100, (current / target) * 100) : 0,
        isNext: false,
      };
    }
    case 'age_range': {
      const matches = ageMatchesRange(stats.age, badge.requirementConfig ?? null);
      return {
        label: matches
          ? 'Matches your age — badge unlocks automatically'
          : badge.description ?? 'Based on profile age',
        pct: matches ? 100 : 0,
        isNext: false,
      };
    }
    default:
      return {
        label: badge.description ?? 'Complete the requirement to unlock',
        pct: 0,
        isNext: false,
      };
  }
}

export function markNextBadges(
  badges: BadgeDto[],
  stats: BadgeGuideStats,
): Map<string, BadgeProgress> {
  const progressMap = new Map<string, BadgeProgress>();
  for (const badge of badges) {
    progressMap.set(badge.id, computeBadgeProgress(badge, stats));
  }

  for (const category of ['point', 'mission'] as const) {
    const next = badges
      .filter((b) => b.category === category && !b.earned)
      .sort(sortBadgesForGuide)[0];
    if (next) {
      const p = progressMap.get(next.id);
      if (p) progressMap.set(next.id, { ...p, isNext: true });
    }
  }

  return progressMap;
}

export function groupBadgesByCategory(badges: BadgeDto[]): Map<string, BadgeDto[]> {
  const groups = new Map<string, BadgeDto[]>();
  for (const cat of CATEGORY_ORDER) {
    groups.set(cat, []);
  }
  for (const badge of badges) {
    const cat = badge.category ?? 'special';
    const list = groups.get(cat) ?? groups.get('special')!;
    list.push(badge);
  }
  for (const [cat, list] of groups) {
    list.sort(sortBadgesForGuide);
    groups.set(cat, list);
  }
  return groups;
}
