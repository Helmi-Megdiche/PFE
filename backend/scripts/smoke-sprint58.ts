/**
 * Sprint 5.6–5.8 comprehensive smoke test
 * - Dynamic wellbeing proxies (missions + usage)
 * - Child interests API + mission tie-breaker
 * - Age-based screen caps, scores/level API
 *
 * Usage: npx tsx scripts/smoke-sprint58.ts
 *        npx tsx scripts/smoke-sprint58.ts --base-url http://localhost:3000
 *
 * Requires: API running (npm run dev), PostgreSQL up, dev seed applied.
 */

import { pool, query } from '../src/db/pool';
import { computeAndStoreDailyScore } from '../src/jobs/dailyScoreJob';
import {
  fetchBedtimeVarianceMinutes,
  fetchFamilyInteractionCount,
  fetchPhysicalActivityMinutes,
  fetchRecommendedScreenMinutes,
} from '../src/scoring/wellbeingProxies';
import {
  pickMissionTemplate,
  INTEREST_TAG_MAP,
} from '../src/services/missionGenerator';

const CHILD_ID = '33333333-3333-3333-3333-333333333333';
const PARENT_ID = '11111111-1111-1111-1111-111111111111';
const DEFAULT_BIRTH_YEAR = 2014;

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
const warnings: string[] = [];

function utcDateStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
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
  if (result === 'warn') warnings.push(message);
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

async function setBirthYear(year: number): Promise<void> {
  await query(
    `UPDATE children SET birth_year = $1 WHERE id = $2`,
    [year, CHILD_ID],
  );
}

async function setInterests(interests: string[]): Promise<void> {
  await query(
    `UPDATE children SET interests = $1::jsonb WHERE id = $2`,
    [JSON.stringify(interests), CHILD_ID],
  );
}

async function clearPendingMissions(): Promise<void> {
  await query(
    `UPDATE missions SET status = 'expired'
     WHERE child_id = $1 AND status IN ('pending', 'pending_approval')`,
    [CHILD_ID],
  );
}

async function seedCompletedMission(opts: {
  templateKey: string;
  type: string;
  action: string;
  title: string;
  completedAt?: Date;
}): Promise<string> {
  const completedAt = opts.completedAt ?? new Date();
  const { rows } = await query<{ id: string }>(
    `INSERT INTO missions (
      child_id, title, description, points, status, trigger_reason, metadata, completed_at
    ) VALUES ($1, $2, $3, 20, 'completed', 'smoke_test', $4::jsonb, $5)
    RETURNING id`,
    [
      CHILD_ID,
      opts.title,
      `Smoke test ${opts.templateKey}`,
      JSON.stringify({
        type: opts.type,
        templateKey: opts.templateKey,
        action: opts.action,
      }),
      completedAt.toISOString(),
    ],
  );
  return rows[0].id;
}

async function seedUsageSessions(scoreDate: Date): Promise<void> {
  const base = new Date(scoreDate);
  base.setUTCHours(0, 0, 0, 0);

  for (let day = 0; day < 7; day++) {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - (6 - day));
    const start = new Date(d);
    start.setUTCHours(20, 0, 0, 0);
    const end = new Date(d);
    end.setUTCHours(21 + (day % 3) * 0.25, (day * 7) % 60, 0, 0);

    await query(
      `INSERT INTO usage_sessions (child_id, start_time, end_time, app_package, app_category)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        CHILD_ID,
        start.toISOString(),
        end.toISOString(),
        'com.smoke.test',
        day % 2 === 0 ? 'educational' : 'social',
      ],
    );
  }

  const todayStart = new Date(base);
  todayStart.setUTCHours(18, 0, 0, 0);
  const todayEnd = new Date(base);
  todayEnd.setUTCHours(19, 30, 0, 0);
  await query(
    `INSERT INTO usage_sessions (child_id, start_time, end_time, app_package, app_category)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      CHILD_ID,
      todayStart.toISOString(),
      todayEnd.toISOString(),
      'com.smoke.today',
      'educational',
    ],
  );
}

async function cleanupSmokeData(): Promise<void> {
  await query(
    `DELETE FROM missions WHERE child_id = $1 AND trigger_reason = 'smoke_test'`,
    [CHILD_ID],
  );
  await query(
    `DELETE FROM usage_sessions WHERE child_id = $1 AND app_package LIKE 'com.smoke.%'`,
    [CHILD_ID],
  );
  await setBirthYear(DEFAULT_BIRTH_YEAR);
  await setInterests([]);
}

function testPickMissionDeterministic(
  label: string,
  input: Parameters<typeof pickMissionTemplate>[0],
  expectedKeys: string[],
): void {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    const { key } = pickMissionTemplate(input);
    assert(
      expectedKeys.includes(key),
      `${label}: picked "${key}" (expected one of ${expectedKeys.join(', ')})`,
      `${label}: picked "${key}" but expected one of ${expectedKeys.join(', ')}`,
    );
  } finally {
    Math.random = originalRandom;
  }
}

async function generateAndInspectMission(
  parentToken: string,
  triggerType: string,
  score: number,
  category: string | undefined,
  expectedTemplateKeys: string[],
  label: string,
): Promise<void> {
  await clearPendingMissions();
  const gen = await api<{ created: boolean; missionId?: string; reason?: string }>(
    'POST',
    '/api/missions/generate',
    {
      token: parentToken,
      body: {
        childId: CHILD_ID,
        triggerType,
        score,
        category,
      },
    },
  );

  if (!gen.data.created) {
    record('fail', `${label}: mission not created (${gen.data.reason ?? 'unknown'})`);
    return;
  }

  const list = await api<{
    pending: Array<{ id: string; metadata: { templateKey?: string } }>;
  }>('GET', `/api/missions/child/${CHILD_ID}`, { token: parentToken });

  const mission = list.data.pending?.find((m) => m.id === gen.data.missionId);
  const templateKey = mission?.metadata?.templateKey ?? '(missing)';
  assert(
    expectedTemplateKeys.includes(templateKey),
    `${label}: API mission templateKey="${templateKey}"`,
    `${label}: expected templateKey in [${expectedTemplateKeys.join(', ')}], got "${templateKey}"`,
  );
}

async function main(): Promise<void> {
  console.log('\x1b[1mSprint 5.6–5.8 comprehensive smoke test\x1b[0m');
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Child ID: ${CHILD_ID}`);

  const smokeMissionIds: string[] = [];

  try {
    logStep('0. Prerequisites');
    const health = await api<{ status: string }>('GET', '/api/health');
    assert(health.data.status === 'ok', 'API health check OK', 'API health check failed');

    const childAuth = await api<{ token: string; childId: string }>(
      'GET',
      '/api/dev/child-token',
    );
    const parentAuth = await api<{ token: string }>(
      'GET',
      '/api/dev/parent-token',
    );
    const childToken = childAuth.data.token;
    const parentToken = parentAuth.data.token;
    assert(!!childToken && !!parentToken, 'Dev JWT tokens obtained', 'Failed to obtain dev tokens');

    logStep('1. Child interests API');
    const getEmpty = await api<{ interests: string[] }>(
      'GET',
      `/api/child/interests/${CHILD_ID}`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      Array.isArray(getEmpty.data.interests),
      'GET interests returns array',
      'GET interests did not return array',
    );

    const putSports = await api<{ success: boolean; interests: string[] }>(
      'PUT',
      '/api/child/interests',
      {
        token: parentToken,
        body: { childId: CHILD_ID, interests: ['sports', 'reading'] },
        expectStatus: 200,
      },
    );
    assert(
      putSports.data.success === true &&
        putSports.data.interests.includes('sports'),
      'PUT interests (sports, reading) succeeded',
      'PUT interests failed',
    );

    const getAfter = await api<{ interests: string[] }>(
      'GET',
      `/api/child/interests/${CHILD_ID}`,
      { token: parentToken,
      },
    );
    assert(
      getAfter.data.interests.includes('sports') &&
        getAfter.data.interests.includes('reading'),
      'GET interests reflects saved values',
      'GET interests mismatch after PUT',
    );

    const badPut = await api('PUT', '/api/child/interests', {
      token: parentToken,
      body: { childId: CHILD_ID, interests: ['invalid_tag'] },
    });
    assert(
      badPut.status === 400,
      'PUT rejects invalid interest tag (400)',
      `PUT invalid interest expected 400, got ${badPut.status}`,
    );

    const wrongChild = '00000000-0000-0000-0000-000000000000';
    const denied = await api('GET', `/api/child/interests/${wrongChild}`, {
      token: parentToken,
    });
    assert(
      denied.status === 403,
      'GET interests returns 403 for non-owned child',
      `GET non-owned child expected 403, got ${denied.status}`,
    );

    logStep('2. Age-based recommended screen minutes');
    const ageScenarios = [
      { birthYear: 2018, label: 'age ~8', expected: 120 },
      { birthYear: 2014, label: 'age ~12', expected: 150 },
      { birthYear: 2010, label: 'age ~16', expected: 180 },
    ] as const;

    for (const scenario of ageScenarios) {
      await setBirthYear(scenario.birthYear);
      const cap = await fetchRecommendedScreenMinutes(CHILD_ID);
      assert(
        cap === scenario.expected,
        `${scenario.label} (birth ${scenario.birthYear}): recommended cap = ${cap} min`,
        `${scenario.label}: expected cap ${scenario.expected}, got ${cap}`,
      );
    }

    logStep('3. Pure pickMissionTemplate tie-breaker (deterministic)');
    testPickMissionDeterministic(
      'Young child (8) + sports + low wellbeing',
      {
        triggerReason: 'low_wellbeing',
        triggerScore: 25,
        addictionScore: 30,
        wellbeingScore: 25,
        age: 8,
        recentTemplateKeys: [],
        interests: ['sports'],
      },
      ['physical_activity'],
    );

    testPickMissionDeterministic(
      'Teen (16) + family + low wellbeing',
      {
        triggerReason: 'low_wellbeing',
        triggerScore: 25,
        addictionScore: 30,
        wellbeingScore: 25,
        age: 16,
        recentTemplateKeys: [],
        interests: ['family'],
      },
      ['family_interaction'],
    );

    testPickMissionDeterministic(
      'Tween (12) + brain + high addiction',
      {
        triggerReason: 'high_addiction',
        triggerScore: 85,
        addictionScore: 85,
        wellbeingScore: 50,
        age: 12,
        recentTemplateKeys: [],
        interests: ['brain'],
      },
      ['nback', 'tower'],
    );

    testPickMissionDeterministic(
      'Tween (12) + sports does NOT override high addiction priority',
      {
        triggerReason: 'risky_content',
        triggerScore: 85,
        addictionScore: 85,
        wellbeingScore: 60,
        combinedRiskScore: 85,
        category: 'adult',
        age: 12,
        recentTemplateKeys: [],
        interests: ['sports'],
      },
      ['nback', 'tower', 'digital_detox'],
    );

    testPickMissionDeterministic(
      'Child (9) + reading + risky adult content',
      {
        triggerReason: 'risky_content',
        triggerScore: 85,
        addictionScore: 30,
        wellbeingScore: 60,
        combinedRiskScore: 85,
        category: 'adult',
        age: 9,
        recentTemplateKeys: [],
        interests: ['reading'],
      },
      [
        'quiz_safety',
        'educational_relationships',
        'conflict_resolution_quiz',
        'digital_detox',
        'tictactoe',
        'nback',
      ],
    );

    testPickMissionDeterministic(
      'Teen (14) + art + toxic content',
      {
        triggerReason: 'risky_content',
        triggerScore: 80,
        addictionScore: 25,
        wellbeingScore: 55,
        combinedRiskScore: 80,
        category: 'toxic',
        age: 14,
        recentTemplateKeys: [],
        interests: ['art'],
      },
      ['positive_communication', 'empathy_exercise'],
    );

    assert(
      Object.keys(INTEREST_TAG_MAP).length === 5,
      'INTEREST_TAG_MAP has 5 interest tags',
      'INTEREST_TAG_MAP tag count unexpected',
    );

    logStep('4. API mission generation with interests (end-to-end)');
    await setBirthYear(2018);
    await setInterests(['sports']);
    await generateAndInspectMission(
      parentToken,
      'low_wellbeing',
      25,
      undefined,
      ['physical_activity'],
      'API E2E age~8 sports + low wellbeing',
    );

    await setBirthYear(2010);
    await setInterests(['family']);
    await generateAndInspectMission(
      parentToken,
      'low_wellbeing',
      25,
      undefined,
      ['family_interaction'],
      'API E2E age~16 family + low wellbeing',
    );

    await setBirthYear(2014);
    await setInterests(['brain']);
    await generateAndInspectMission(
      parentToken,
      'high_addiction',
      85,
      undefined,
      ['nback', 'tower', 'digital_detox'],
      'API E2E age~12 brain + high addiction',
    );

    await setInterests(['sports']);
    await generateAndInspectMission(
      parentToken,
      'high_addiction',
      85,
      'adult',
      ['nback', 'tower', 'digital_detox'],
      'API E2E sports interest cannot override addiction branch',
    );

    logStep('5. Dynamic wellbeing proxies + daily score job');
    await cleanupSmokeData();
    const scoreDate = new Date();
    scoreDate.setUTCHours(12, 0, 0, 0);

    const physicalBaseline = await fetchPhysicalActivityMinutes(CHILD_ID, scoreDate);
    const familyBaseline = await fetchFamilyInteractionCount(CHILD_ID, scoreDate);

    smokeMissionIds.push(
      await seedCompletedMission({
        templateKey: 'physical_activity',
        type: 'real_world',
        action: 'jumping_jacks',
        title: 'Smoke physical 1',
        completedAt: scoreDate,
      }),
    );
    smokeMissionIds.push(
      await seedCompletedMission({
        templateKey: 'physical_activity',
        type: 'real_world',
        action: 'jumping_jacks',
        title: 'Smoke physical 2',
        completedAt: scoreDate,
      }),
    );
    smokeMissionIds.push(
      await seedCompletedMission({
        templateKey: 'family_interaction',
        type: 'real_world',
        action: 'board_game',
        title: 'Smoke family',
        completedAt: scoreDate,
      }),
    );

    await seedUsageSessions(scoreDate);

    const physicalMin = await fetchPhysicalActivityMinutes(CHILD_ID, scoreDate);
    const familyCount = await fetchFamilyInteractionCount(CHILD_ID, scoreDate);
    const bedtimeVar = await fetchBedtimeVarianceMinutes(CHILD_ID, scoreDate);

    assert(
      physicalMin === physicalBaseline + 20,
      `Physical proxy = ${physicalMin} min (baseline ${physicalBaseline} + 20 from 2 new missions)`,
      `Physical proxy expected ${physicalBaseline + 20}, got ${physicalMin}`,
    );
    assert(
      familyCount === familyBaseline + 1,
      `Family proxy count = ${familyCount} (baseline ${familyBaseline} + 1 new)`,
      `Family proxy expected ${familyBaseline + 1}, got ${familyCount}`,
    );
    assert(
      bedtimeVar >= 0 && bedtimeVar <= 180,
      `Bedtime variance = ${bedtimeVar.toFixed(1)} min (in range)`,
      `Bedtime variance out of range: ${bedtimeVar}`,
    );

    const scores = await computeAndStoreDailyScore(CHILD_ID, scoreDate);
    assert(
      scores.wellbeingScore >= 0 && scores.wellbeingScore <= 100,
      `Daily wellbeing score computed: ${scores.wellbeingScore}`,
      `Invalid wellbeing score: ${scores.wellbeingScore}`,
    );

    const scoreRow = await query<{
      real_activity: number | null;
      family_interaction: number | null;
      sleep_consistency: number | null;
      screen_balance: number | null;
    }>(
      `SELECT real_activity, family_interaction, sleep_consistency, screen_balance
       FROM daily_scores WHERE child_id = $1 AND score_date = $2::date`,
      [CHILD_ID, utcDateStr(scoreDate)],
    );

    const row = scoreRow.rows[0];
    if (row) {
      assert(
        (row.real_activity ?? 0) > 0,
        `Stored real_activity component = ${row.real_activity}`,
        `Stored real_activity expected > 0, got ${row.real_activity}`,
      );
      assert(
        (row.family_interaction ?? 0) > 0,
        `Stored family_interaction component = ${row.family_interaction}`,
        `Stored family_interaction expected > 0, got ${row.family_interaction}`,
      );
      if ((row.sleep_consistency ?? 0) === 100 && bedtimeVar === 30) {
        record(
          'warn',
          'sleep_consistency=100 with default bedtime fallback (limited usage history variance)',
        );
      } else {
        record(
          'pass',
          `Stored sleep_consistency = ${row.sleep_consistency} (bedtime proxy ${bedtimeVar.toFixed(1)} min)`,
        );
      }
    } else {
      record('fail', 'No daily_scores row after computeAndStoreDailyScore');
    }

    logStep('6. Scores API (level + totalPoints)');
    const latest = await api<{
      totalPoints: number;
      level: number;
      wellbeingScore: number;
      components: { wellbeing: { realActivity: number } };
    }>('GET', `/api/scores/${CHILD_ID}`, { token: parentToken });

    assert(
      latest.status === 200 &&
        typeof latest.data.totalPoints === 'number' &&
        typeof latest.data.level === 'number',
      `GET /scores includes totalPoints=${latest.data.totalPoints}, level=${latest.data.level}`,
      `GET /scores missing totalPoints/level (status ${latest.status})`,
    );

    const trend = await api<{ scores: unknown[] }>(
      'GET',
      `/api/scores/${CHILD_ID}/trend?days=7`,
      { token: parentToken, expectStatus: 200 },
    );
    assert(
      Array.isArray(trend.data.scores),
      `Score trend returned ${(trend.data.scores as unknown[]).length} days`,
      'Score trend response invalid',
    );

    logStep('7. Usage POST + parent approval proxy path');
    await clearPendingMissions();
    await setBirthYear(2014);
    await setInterests(['sports']);

    const genRw = await api<{ created: boolean; missionId?: string }>(
      'POST',
      '/api/missions/generate',
      {
        token: parentToken,
        body: {
          childId: CHILD_ID,
          triggerType: 'low_wellbeing',
          score: 25,
        },
      },
    );

    if (genRw.data.created && genRw.data.missionId) {
      const physicalBeforeApprove = await fetchPhysicalActivityMinutes(
        CHILD_ID,
        new Date(),
      );

      const complete = await api('POST', `/api/missions/${genRw.data.missionId}/complete`, {
        token: childToken,
        body: { confirmed: true },
        expectStatus: 200,
      });
      assert(complete.status === 200, 'Real-world complete → pending_approval', 'Complete mission failed');

      const approve = await api('POST', `/api/missions/${genRw.data.missionId}/approve`, {
        token: parentToken,
        expectStatus: 200,
      });
      assert(approve.status === 200, 'Parent approve real-world mission', 'Parent approve failed');

      const physicalAfter = await fetchPhysicalActivityMinutes(CHILD_ID, new Date());
      assert(
        physicalAfter >= physicalBeforeApprove + 10,
        `After approve: physical proxy ${physicalBeforeApprove} → ${physicalAfter} min (+10)`,
        `After approve: physical proxy expected +10, got ${physicalBeforeApprove} → ${physicalAfter}`,
      );
    } else {
      record('skip', 'Skipped approval flow — could not create low_wellbeing mission');
    }

    logStep('8. Restore test child state');
    await cleanupSmokeData();
    await api('PUT', '/api/child/interests', {
      token: parentToken,
      body: { childId: CHILD_ID, interests: [] },
    });
    record('pass', 'Cleaned smoke missions/usage and reset birth_year + interests');
  } catch (err) {
    record('fail', `Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err);
  } finally {
    try {
      await cleanupSmokeData();
    } catch {
      /* ignore cleanup errors */
    }
    await pool.end();
  }

  console.log('\n\x1b[1m--- Summary ---\x1b[0m');
  console.log(
    `Pass: ${stats.pass} | Fail: ${stats.fail} | Warn: ${stats.warn} | Skip: ${stats.skip}`,
  );

  if (warnings.length) {
    console.log('\n\x1b[33mWarnings:\x1b[0m');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (failures.length) {
    console.log('\n\x1b[31mFailures:\x1b[0m');
    failures.forEach((f) => console.log(`  - ${f}`));
    console.log('\n\x1b[31mSmoke test FAILED\x1b[0m\n');
    process.exit(1);
  }

  console.log('\n\x1b[32mSmoke test PASSED\x1b[0m\n');
  process.exit(0);
}

void main();
