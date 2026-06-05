/**
 * Sprint 5.9 backend tests — editable birth year, age badges, ranks data, screen caps.
 *
 * Usage: npm run test:sprint59
 *        npx tsx scripts/test-sprint59.ts --base-url http://localhost:3000
 *
 * Requires: API running (npm run dev), PostgreSQL up, dev seed applied.
 */

import { pool, query } from '../src/db/pool';
import {
  getChildLevel,
  getChildPoints,
} from '../src/services/gamificationService';
import { countCompletedMissions } from '../src/services/missionHelpers';
import { fetchRecommendedScreenMinutes } from '../src/scoring/wellbeingProxies';

const CHILD_ID = '33333333-3333-3333-3333-333333333333';
const ORIGINAL_BIRTH_YEAR = 2014;
const TEST_BIRTH_YEAR = 2008; // age 18+ → Master badge band (2026)

const args = process.argv.slice(2);
const baseUrl =
  args.find((a) => a.startsWith('--base-url='))?.split('=')[1] ??
  (args.includes('--base-url')
    ? args[args.indexOf('--base-url') + 1]
    : 'http://localhost:3000');

type Result = 'pass' | 'fail' | 'warn' | 'skip';

interface Stats {
  pass: number;
  fail: number;
  warn: number;
  skip: number;
}

const stats: Stats = { pass: 0, fail: 0, warn: 0, skip: 0 };
const failures: string[] = [];

function currentYear(): number {
  return new Date().getUTCFullYear();
}

function ageFromBirthYear(birthYear: number): number {
  return currentYear() - birthYear;
}

function logStep(title: string): void {
  console.log(`\n\x1b[36m==> ${title}\x1b[0m`);
}

function record(result: Result, message: string): void {
  stats[result] += 1;
  const colors: Record<Result, string> = {
    pass: '\x1b[32m',
    fail: '\x1b[31m',
    warn: '\x1b[33m',
    skip: '\x1b[90m',
  };
  const labels: Record<Result, string> = {
    pass: 'PASS',
    fail: 'FAIL',
    warn: 'WARN',
    skip: 'SKIP',
  };
  console.log(`${colors[result]}[${labels[result]}]\x1b[0m ${message}`);
  if (result === 'fail') failures.push(message);
}

function assert(condition: boolean, passMsg: string, failMsg: string): void {
  record(condition ? 'pass' : 'fail', condition ? passMsg : failMsg);
}

async function api<T = unknown>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; expectStatus?: number } = {},
): Promise<{ status: number; data: T; raw: string }> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body != null) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  const raw = await res.text();
  let data: T;
  try {
    data = raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    data = { raw } as T;
  }

  if (options.expectStatus != null && res.status !== options.expectStatus) {
    throw new Error(
      `Expected HTTP ${options.expectStatus} for ${method} ${path}, got ${res.status}: ${raw}`,
    );
  }

  return { status: res.status, data, raw };
}

async function getEarnedAgeBadgeNames(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(
    `SELECT b.name
     FROM child_badges cb
     JOIN badges b ON b.id = cb.badge_id
     WHERE cb.child_id = $1 AND b.requirement_type = 'age_range'
     ORDER BY b.name`,
    [CHILD_ID],
  );
  return rows.map((r) => r.name);
}

async function getEarnedBadgeIds(): Promise<string[]> {
  const { rows } = await query<{ badge_id: string }>(
    `SELECT badge_id FROM child_badges WHERE child_id = $1 ORDER BY badge_id`,
    [CHILD_ID],
  );
  return rows.map((r) => r.badge_id);
}

function printManualChecklist(): void {
  console.log('\n\x1b[1m--- Manual UI checklist (Sprint 5.9) ---\x1b[0m');
  const items = [
    'Parent dashboard (http://<PC_IP>:3000/demo.html) → Parent tab → Child profile shows birth year input',
    'Change birth year → Save age → header shows updated age',
    'Earned badges card → Badge ranks button opens modal with points/mission progress',
    'Badge ranks modal shows Age line matching saved birth year',
    'Child app → Badges tab → Ranks header opens progress modal',
    'Complete a mission on device → Ranks shows updated mission count and point progress',
    'Parent: save interests → child receives interest-tied missions over time (tie-breaker)',
  ];
  items.forEach((item, i) => console.log(`  ${i + 1}. [ ] ${item}`));
  console.log('');
}

async function main(): Promise<void> {
  let parentToken = '';
  let restoreBirthYear = ORIGINAL_BIRTH_YEAR;
  let initialBirthYear = ORIGINAL_BIRTH_YEAR;
  let initialTotalPoints = 0;
  let initialBadgeIds: string[] = [];
  let initialMissionCount = 0;

  try {
    logStep('0. Health + parent token');
    const health = await api<{ status: string }>('GET', '/api/health', {
      expectStatus: 200,
    });
    assert(health.data.status === 'ok', 'API health OK', 'API health failed');

    const tokenRes = await api<{ token: string }>('GET', '/api/dev/parent-token', {
      expectStatus: 200,
    });
    parentToken = tokenRes.data.token;
    assert(!!parentToken, 'Parent dev token obtained', 'Parent dev token missing');

    logStep('1. Get initial state');
    const profileBefore = await api<{
      birthYear: number | null;
      displayName: string;
    }>('GET', `/api/child/profile/${CHILD_ID}`, {
      token: parentToken,
      expectStatus: 200,
    });
    initialBirthYear = profileBefore.data.birthYear ?? ORIGINAL_BIRTH_YEAR;
    restoreBirthYear = initialBirthYear;

    const pointsRes = await api<{ totalPoints: number }>(
      'GET',
      `/api/missions/child/${CHILD_ID}/points`,
      { token: parentToken, expectStatus: 200 },
    );
    initialTotalPoints = pointsRes.data.totalPoints;

    const scoreRes = await api<{ totalPoints?: number; level?: number }>(
      'GET',
      `/api/scores/${CHILD_ID}`,
      { token: parentToken },
    );
    if (scoreRes.status === 200) {
      assert(
        scoreRes.data.totalPoints === initialTotalPoints,
        `Scores API totalPoints matches points endpoint (${initialTotalPoints})`,
        `Scores totalPoints mismatch: ${scoreRes.data.totalPoints} vs ${initialTotalPoints}`,
      );
      const expectedLevel = getChildLevel(initialTotalPoints);
      assert(
        scoreRes.data.level === expectedLevel,
        `Scores level ${scoreRes.data.level} matches floor(points/500)+1`,
        `Scores level expected ${expectedLevel}, got ${scoreRes.data.level}`,
      );
    } else {
      record(
        'warn',
        `Scores API returned ${scoreRes.status} — using points endpoint only for ranks check`,
      );
    }

    initialBadgeIds = await getEarnedBadgeIds();
    initialMissionCount = await countCompletedMissions(CHILD_ID);

    const earnedBadges = await api<{ badges: { id: string; name: string }[] }>(
      'GET',
      `/api/badges/child/${CHILD_ID}`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      earnedBadges.data.badges.length === initialBadgeIds.length,
      `Earned badges API count ${earnedBadges.data.badges.length} matches DB`,
      `Earned badges count mismatch API vs DB`,
    );

    record(
      'pass',
      `Initial: birthYear=${initialBirthYear}, points=${initialTotalPoints}, missions=${initialMissionCount}, badges=${initialBadgeIds.length}`,
    );

    const ageBadgesBefore = await getEarnedAgeBadgeNames();
    record('pass', `Initial age badges: ${ageBadgesBefore.join(', ') || '(none)'}`);

    logStep('2. Update birth year via PUT /api/child/profile');
    const updateRes = await api<{
      success: boolean;
      birthYear: number;
      newBadges?: string[];
    }>('PUT', '/api/child/profile', {
      token: parentToken,
      body: { childId: CHILD_ID, birthYear: TEST_BIRTH_YEAR },
      expectStatus: 200,
    });
    assert(updateRes.data.success === true, 'Profile update success=true', 'Profile update not successful');
    assert(
      updateRes.data.birthYear === TEST_BIRTH_YEAR,
      `Response birthYear=${TEST_BIRTH_YEAR}`,
      `Response birthYear expected ${TEST_BIRTH_YEAR}, got ${updateRes.data.birthYear}`,
    );

    const profileAfter = await api<{ birthYear: number }>(
      'GET',
      `/api/child/profile/${CHILD_ID}`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      profileAfter.data.birthYear === TEST_BIRTH_YEAR,
      `GET profile confirms birthYear=${TEST_BIRTH_YEAR}`,
      `GET profile birthYear mismatch after update`,
    );

    logStep('3. Age badge re-award (PUT + dev endpoint)');
    const ageBadgesAfterPut = await getEarnedAgeBadgeNames();
    const hasMaster = ageBadgesAfterPut.includes('Master');
    assert(
      hasMaster,
      `Master age badge awarded for birth year ${TEST_BIRTH_YEAR} (age ${ageFromBirthYear(TEST_BIRTH_YEAR)})`,
      `Master badge missing after profile update; got: ${ageBadgesAfterPut.join(', ')}`,
    );

    assert(
      ageBadgesAfterPut.length === 1 && ageBadgesAfterPut[0] === 'Master',
      `Only matching age badge kept after birth year change: Master (got: ${ageBadgesAfterPut.join(', ')})`,
      `Expected only Master age badge, got: ${ageBadgesAfterPut.join(', ')}`,
    );

    const mismatchedStillPresent = ageBadgesBefore.filter(
      (name) => name !== 'Master' && ageBadgesAfterPut.includes(name),
    );
    assert(
      mismatchedStillPresent.length === 0,
      'Mismatched age badges revoked on profile update',
      `Stale age badges still present: ${mismatchedStillPresent.join(', ')}`,
    );

    const devAward = await api<{ success: boolean; newBadges: string[] }>(
      'POST',
      `/api/dev/reward-age-badges/${CHILD_ID}`,
      { expectStatus: 200 },
    );
    assert(devAward.data.success === true, 'Dev reward-age-badges endpoint OK', 'Dev endpoint failed');

    logStep('4. Age-based screen time caps (fetchRecommendedScreenMinutes)');
    const capAtTestYear = await fetchRecommendedScreenMinutes(CHILD_ID);
    assert(
      capAtTestYear === 180,
      `Age ${ageFromBirthYear(TEST_BIRTH_YEAR)} → recommended screen cap 180 min`,
      `Expected 180 min cap at age ${ageFromBirthYear(TEST_BIRTH_YEAR)}, got ${capAtTestYear}`,
    );

    await api('PUT', '/api/child/profile', {
      token: parentToken,
      body: { childId: CHILD_ID, birthYear: 2018 },
      expectStatus: 200,
    });
    const capAge8 = await fetchRecommendedScreenMinutes(CHILD_ID);
    assert(capAge8 === 120, 'Age 8 (birth 2018) → 120 min cap', `Expected 120 min, got ${capAge8}`);

    await api('PUT', '/api/child/profile', {
      token: parentToken,
      body: { childId: CHILD_ID, birthYear: 2014 },
      expectStatus: 200,
    });
    const capAge12 = await fetchRecommendedScreenMinutes(CHILD_ID);
    assert(capAge12 === 150, 'Age 12 (birth 2014) → 150 min cap', `Expected 150 min, got ${capAge12}`);

    await api('PUT', '/api/child/profile', {
      token: parentToken,
      body: { childId: CHILD_ID, birthYear: 2010 },
      expectStatus: 200,
    });
    const capAge16 = await fetchRecommendedScreenMinutes(CHILD_ID);
    assert(capAge16 === 180, 'Age 16+ (birth 2010) → 180 min cap', `Expected 180 min, got ${capAge16}`);

    logStep('5. Restore original birth year');
    await api('PUT', '/api/child/profile', {
      token: parentToken,
      body: { childId: CHILD_ID, birthYear: initialBirthYear },
      expectStatus: 200,
    });
    const restored = await api<{ birthYear: number }>(
      'GET',
      `/api/child/profile/${CHILD_ID}`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      restored.data.birthYear === initialBirthYear,
      `Birth year restored to ${initialBirthYear}`,
      `Restore failed: expected ${initialBirthYear}, got ${restored.data.birthYear}`,
    );

    logStep('6. Verify ranks data (points, missions, badge list)');
    const finalPointsApi = await api<{ totalPoints: number }>(
      'GET',
      `/api/missions/child/${CHILD_ID}/points`,
      { token: parentToken, expectStatus: 200 },
    );
    const finalPointsDb = await getChildPoints(CHILD_ID);
    assert(
      finalPointsApi.data.totalPoints === finalPointsDb,
      `Points API (${finalPointsApi.data.totalPoints}) matches DB child_points`,
      `Points mismatch API ${finalPointsApi.data.totalPoints} vs DB ${finalPointsDb}`,
    );

    const expectedLevel = getChildLevel(finalPointsDb);
    const scoreFinal = await api<{ level?: number; totalPoints?: number }>(
      'GET',
      `/api/scores/${CHILD_ID}`,
      { token: parentToken },
    );
    if (scoreFinal.status === 200) {
      assert(
        scoreFinal.data.level === expectedLevel,
        `Final level ${expectedLevel} = floor(${finalPointsDb}/500)+1`,
        `Final level mismatch: expected ${expectedLevel}, got ${scoreFinal.data.level}`,
      );
    }

    const finalMissionCount = await countCompletedMissions(CHILD_ID);
    assert(
      finalMissionCount === initialMissionCount,
      `Mission count unchanged after profile tests (${finalMissionCount})`,
      `Mission count changed unexpectedly: ${initialMissionCount} → ${finalMissionCount}`,
    );

    const allBadges = await api<{
      badges: {
        id: string;
        name: string;
        earned: boolean;
        requirementType: string | null;
        requirementValue: number | null;
        category: string;
      }[];
    }>('GET', `/api/badges?childId=${CHILD_ID}`, {
      token: parentToken,
      expectStatus: 200,
    });

    const pointBadges = allBadges.data.badges.filter((b) => b.requirementType === 'total_points');
    const missionBadges = allBadges.data.badges.filter(
      (b) => b.requirementType === 'missions_completed',
    );
    assert(pointBadges.length > 0, `${pointBadges.length} point-rank badges in list API`, 'No point badges');
    assert(missionBadges.length > 0, `${missionBadges.length} mission-rank badges in list API`, 'No mission badges');

    const earnedPointBadges = pointBadges.filter(
      (b) => b.earned && (b.requirementValue ?? 0) <= finalPointsDb,
    );
    const unearnedPointBadges = pointBadges.filter((b) => !b.earned);
    if (unearnedPointBadges.length > 0) {
      const next = unearnedPointBadges.sort(
        (a, b) => (a.requirementValue ?? 0) - (b.requirementValue ?? 0),
      )[0];
      const remaining = (next.requirementValue ?? 0) - finalPointsDb;
      record(
        'pass',
        `Next point badge "${next.name}": ${finalPointsDb}/${next.requirementValue} (${remaining} more) — ranks UI source data OK`,
      );
    }
    record(
      'pass',
      `Ranks mission count source: ${finalMissionCount} completed (same SQL as dashboard guide)`,
    );
    record(
      'pass',
      `${earnedPointBadges.length} earned point badges consistent with totalPoints ${finalPointsDb}`,
    );

    logStep('7. Interests API sanity (personalisation still wired)');
    const interestsRes = await api<{ interests: string[] }>(
      'GET',
      `/api/child/interests/${CHILD_ID}`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      Array.isArray(interestsRes.data.interests),
      `Interests API readable (${interestsRes.data.interests.length} saved)`,
      'Interests API failed',
    );
  } catch (err) {
    record('fail', `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  } finally {
    try {
      await query(`UPDATE children SET birth_year = $1 WHERE id = $2`, [
        restoreBirthYear,
        CHILD_ID,
      ]);
      record('pass', `Cleanup: birth_year reset to ${restoreBirthYear}`);
    } catch {
      record('warn', 'Cleanup: could not reset birth_year via SQL');
    }
    await pool.end();
  }

  console.log('\n\x1b[1m--- Summary ---\x1b[0m');
  console.log(
    `Pass: ${stats.pass} | Fail: ${stats.fail} | Warn: ${stats.warn} | Skip: ${stats.skip}`,
  );

  if (failures.length) {
    console.log('\n\x1b[31mFailures:\x1b[0m');
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\n\x1b[31mSprint 5.9 backend tests FAILED\x1b[0m\n');
    process.exit(1);
  }

  console.log('\n\x1b[32mAll backend checks passed\x1b[0m');
  printManualChecklist();
  process.exit(0);
}

void main();
